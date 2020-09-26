const net = require('net');

const lnet = module.exports = {}

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

function make_error(code,message)
{
    const err = new Error(message)

    err.code = code 

    return err
}

lnet.listen = async function(...args)
{
    const socket = net.createServer()

    return new Promise((resolve,reject)=>
    {
        socket.once("listening",()=>
        {
            socket.removeAllListeners()

            resolve(new Server(socket))
        })

        socket.on("error",(error)=>
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
        socket.on("connect",()=>
        {
            socket.removeAllListeners()

            resolve(new Connection(socket))
        })

        socket.on("error",(error)=>
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
            this.datas.push(new Connection(socket))
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
                this.wait.reject(error)
                this.wait = null
            }

            this.socket.close()
        })

        this.socket.on("close",()=>
        {
            this.socket.unref()
        })
    }

    async accept()
    {
        if(this.datas.length > 0)
        {
            return this.datas.shift()
        }

        if(this.last_error)
        {
            throw this.last_error
        }

        if(this.socket.listening == false)
        {
            throw make_error("ERR_SOCKET_CLOSED","socket is not listening")
        }

        this.wait = make_wait()

        await this.wait.real

        return this.datas.shift()
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
        this.socket.on("data",(data)=>
        {
            this.datas.push([0,Buffer.from(data)])
            if(this.wait)
            {
                this.wait.resolve()
                this.wait = null
            }

            this.length += data.byteLength

            if(this.length > this.capacity)
            {
                this.socket.pause()
            }
        })

        this.socket.on("error",(error)=>
        {
            this.last_error = error

            if(this.wait)
            {
                this.wait.reject(error)
                this.wait = null
            }
        })

        this.socket.on("close",()=>
        {
            this.socket.unref()
        })
    }

    /**
     * count > 0:read count buffer
     * < 0 : read any 
     * @param {读取的数量} count 
     */
    async read(count = 0)
    {
        if(this.last_error)
        {
            throw this.last_error
        }

        while(this.length == 0 ||(count > 0 && this.length < count)  )
        {
            if(this.socket.destroyed) 
            {
                throw make_error("ERR_SOCKET_CLOSED","socket has been destroyed")
            }

            this.wait = make_wait()

            await this.wait.real
        }

        if(count > 0)
        {
            return this.fetch(count)
        }

        return this.fetch_any()
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
        let buffer = Buffer.allocUnsafe(count)
        let required = count

        while(required > 0)
        {
            let first = this.datas[0]
            let left = first[1].byteLength - first[0]
            let copied = Math.min(left,required)

            buffer.copy(first[1],first[0],count - required,copied)

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