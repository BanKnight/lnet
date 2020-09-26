const lnet = require("./index")

async function test_server()
{
    const server = await lnet.listen(1080)

    console.log("server is listening")

    for(let i = 0; i < 1;++i)
    {
        const client = await server.accept()

        await do_logic(client,"listen")
    }

    server.close()
}

async function test_client()
{
    let client = null

    while(true)
    {
        try
        {
            client = await lnet.connect(1080)

            break
        }
        catch(error)
        {
            console.error(error)
            continue
        }
    }

    console.log("connect ok")

    client.send("quit")

    await do_logic(client,"connect")
}

async function do_logic(client,from)
{
    console.log(from,"new client from",client.socket.localAddress)

    while(true)
    {
        const buffer = await client.read(0)

        const cmd = buffer.toString("utf8")

        console.log(from,"recieve cmd :",cmd)

        if(cmd.indexOf("quit") == 0)
        {
            break
        }

        client.send(from,"your cmd is:" + cmd)
    }

    client.close()
}


test_server()

test_client()