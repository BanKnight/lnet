# lnet
一个超级简单的网络库，封装成同步的写法，从而简化网络编程

# 服务端例子
```js
const server = await lnet.listen(1080)

console.log("server is listening")

for(let i = 0; i < 3;++i)
{
    let client = null

    try
    {
        client = await server.accept()

        console.log("new client connect")

        while(true)
        {
            const buffer = await client.read()
    
            const cmd = buffer.toString("utf8")
    
            console.log("recieve cmd :",cmd)
    
            if(cmd.indexOf("quit") == 0)
            {
                break
            }
            client.send("your cmd is:" + cmd)
        }
    }
    catch(error)
    {
        console.error(error)
    }
    finally
    {
        console.log("client quit")

        client.close()    
    }
}
server.close()
```

# 客户端例子
```js
let client = null

try
{
    client = await lnet.connect(1080)

    console.log("connect ok")

    client.send("hello server")

    client.send("quit")
}
catch(error)
{
    console.error(error)
}
```
