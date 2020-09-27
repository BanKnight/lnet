const lnet = require("./index")

async function test()
{
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
}

test()