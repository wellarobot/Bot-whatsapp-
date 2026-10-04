const express = require('express')
const { default: makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys')
const pino = require('pino')

const app = express()
const PORT = process.env.PORT || 10000
app.get('/', (req,res)=> res.send('LOVERS BOT ONLINE ❤️'))
app.listen(PORT, ()=> console.log('Server running on', PORT))

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState('session')
  const sock = makeWASocket({
    auth: state,
    logger: pino({ level: 'silent' }),
    browser: ["Ubuntu","Chrome","20.0.04"]
  })
  sock.ev.on('creds.update', saveCreds)

  if (!state.creds.registered) {
    setTimeout(async () => {
      try {
        let code = await sock.requestPairingCode("255749520061")
        console.log(`\n\n🔑 PAIRING CODE: ${code}\n\n`)
      } catch(e){ console.log("Pairing error:", e.message) }
    }, 8000)
  }

  sock.ev.on('connection.update', (u) => {
    if (u.connection === 'open') console.log('✅ BOT ONLINE!')
  })

  sock.ev.on('group-participants.update', async (anu) => {
    if (anu.action === 'add') {
      let m = anu.participants[0]
      await sock.sendMessage(anu.id, {
        text: `Karibu @${m.split('@')[0]} kwenye LOVERS CONNECTION ❤️🔥\nTuletee vibe mzee! 😎`,
        mentions: [m]
      })
    }
  })
}
startBot()
