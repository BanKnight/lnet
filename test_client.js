const lnet = require("./index")

async function test()
{
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
    finally
    {
        setTimeout(()=>
        {
            if(client)
            {
                client.close()
            }
        },300)
    }
}

test()