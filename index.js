const net = require('net');

const lnet = module.exports = {}

class LnetError extends Error
{
    constructor(code,message)
    {
        super(message)

        this.code = code
    }
}

function make_wait()
{
    const wait = {}

    wait.real = new Promise((resolve,reject)=>
    {
        wait.resolve = resolve
        wait.reject = reject
    })

    return wait
}

lnet.listen = async function(...args)
{
    const socket = net.createServer({
        allowHalfOpen:false,
        pauseOnConnect:true,
    })

    return new Promise((resolve,reject)=>
    {
        socket.once("listening",()=>
        {
            socket.removeAllListeners()
            resolve(new Server(socket))
        })

        socket.once("error",(error)=>
        {
            socket.removeAllListeners()
            reject(error)
        })

        socket.listen(...args)
    })
}

lnet.connect = async function(...args)
{
    const socket = net.createConnection(...args)

    return new Promise((resolve,reject)=>
    {
        socket.once("connect",()=>
        {
            socket.removeAllListeners()
            resolve(new Connection(socket))
        })

        socket.once("error",(error)=>
        {
            socket.removeAllListeners()
            reject(error)
        })
    })
}

class Server
{
    constructor(socket)
    {
        this.socket = socket
        this.datas = []

        this.wait = null
        this.last_error = null
        
        this.init()
    }

    init()
    {
        this.socket.on("connection",(socket)=>
        {
            this.datas.push(socket)
            if(this.wait)
            {
                this.wait.resolve()
                this.wait = null
            }
        })

        //Unlike net.Socket, the 'close' event will not be emitted directly following this event unless
        this.socket.on("error",(error)=>
        {
            this.last_error = error

            if(this.wait)
            {
                this.wait.resolve()
                this.wait = null
            }

            this.socket.unref()
            this.socket.close()
        })

        this.socket.on("close",()=>
        {
            this.socket.unref()

            this.last_error = this.last_error || new LnetError("ERR_SOCKET_CLOSED","socket has been destroyed")
            
            if(this.wait)
            {
                this.wait.resolve()
                this.wait = null
            }
        })
    }

    async accept()
    {
        if(this.datas.length > 0)
        {
            return this.fetch()
        }

        if(this.last_error)
        {
            throw new LnetError(this.last_error.code,this.last_error.message)
        }

        if(this.socket.listening == false)
        {
            this.last_error = new LnetError("ERR_SOCKET_CLOSED","socket is not listening")
            throw this.last_error
        }

        this.wait = make_wait()

        await this.wait.real

        if(this.last_error)
        {
            throw new LnetError(this.last_error.code,this.last_error.message)
        }

        return this.fetch()
    }

    fetch()
    {
        const socket = this.datas.shift()

        return new Connection(socket)
    }

    close()
    {
        this.socket.close()
    }
}


class Connection
{
    constructor(socket)
    {
        this.socket = socket
        this.datas = []
        this.length = 0
        this.capacity = Infinity            //用于解决读到内存中的数据过大问题
        
        this.wait = null
        this.last_error = null

        this.init()
    }

    init()
    {
        this.socket.resume()

        this.socket.on("data",(data)=>
        {
            this.datas.push([0,Buffer.from(data)])

            this.length += data.byteLength
            if(this.length > this.capacity)
            {
                this.socket.pause()
            }

            if(this.wait)
            {
                this.wait.resolve()
                this.wait = null
            }
        })

        this.socket.on("error",(error)=>
        {
            this.last_error = error

            if(this.wait)
            {
                this.wait.resolve()
                this.wait = null
            }
        })

        this.socket.on("close",(had_error)=>
        {
            this.socket.unref()

            if(this.wait)
            {
                this.wait.resolve()
                this.wait = null
            }
        })
    }

    /**
     * count > 0:read count buffer
     * == 0 : read any 
     * < 0:all left
     * @param {读取的数量} count 
     */
    async read(count = 0)
    {
        if(this.last_error)
        {
            throw this.last_error
        }

        while(this.length == 0 ||(count > 0 && this.length < count))
        {
            if(this.socket.destroyed) 
            {
                throw new LnetError("ERR_SOCKET_CLOSED","socket has been destroyed")
            }

            this.wait = make_wait()

            await this.wait.real

            if(this.last_error)
            {
                throw new LnetError(this.last_error.code,this.last_error.message)
            }
        }

        if(count == 0)
        {
            return this.fetch_any()
        }

        return this.fetch(count)
    }

    send(buffer)
    {
        this.socket.write(buffer)
    }

    close()
    {
        this.socket.destroy()
    }

    fetch_any()
    {
        let first = this.datas.shift()

        this.length -= first[1].byteLength - first[0]

        if(this.length < this.capacity)
        {
            this.socket.resume()
        }

        if(first[0] == 0)
        {
            return first[1]
        }

        return Buffer.from(first[1],first[0],first[1].byteLength - first[0])
    }

    fetch(count)
    {
        if(count < 0)
        {
            count = this.length
        }

        let buffer = Buffer.allocUnsafe(count)
        let required = count

        while(required > 0)
        {
            let first = this.datas[0]
            let left = first[1].byteLength - first[0]
            let copied = Math.min(left,required)

            first[1].copy(buffer, count - required, first[0], first[0] + copied)

            if(left == copied)
            {
                this.datas.shift()
            }

            first[0] += copied
            required -= copied
            this.length -= copied
        }

        if(this.length < this.capacity)
        {
            this.socket.resume()
        }

        return buffer
    }
}