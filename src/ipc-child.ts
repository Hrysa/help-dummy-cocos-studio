import * as net from 'net'

try {
    let sock: any

    const buff = Buffer.alloc(65535)
    process.on('message', (msg) => {
        if (sock) {
            buff.fill(0)
            buff.write(msg)
            sock.write(buff)
        } else {
            process.send!("ERROR no client found")
        }
    });

    const server = new net.Server((s) => {
        if (sock) {
            process.send!("new client try to connect, refused")
            return
        }
        process.send!("new client connected: " + s.remoteAddress + s.remotePort)

        s.on("data", (s) =>  process.send!(s.toString()))
        s.on("close", () => sock = null)
        s.on("error", () => {
            s.destroy()
            sock = null
        })

        sock = s
    })

    server.listen(8861)

} catch (e) {
    process.send!(e.toString())
}