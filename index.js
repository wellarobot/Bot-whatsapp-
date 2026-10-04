const { default: makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys')
const pino = require('pino')

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState('session')

  const sock = makeWASocket({
    auth: state,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
    browser: ["Ubuntu", "Chrome", "20.0.04"]
  })

  sock.ev.on('creds.update', saveCreds)

  if (!state.creds.registered) {
    setTimeout(async () => {
      try {
        let code = await sock.requestPairingCode("255749520061")
        console.log(`\n\n🔑 CODE YAKO: ${code}\n\n`)
      } catch (e) {
        console.log("Error:", e.message)
      }
    }, 5000)
  }

  sock.ev.on('connection.update', (u) => {
    if (u.connection === 'open') console.log('✅ LOVERS BOT IKO ONLINE!')
  })

  sock.ev.on('group-participants.update', async (anu) => {
    if (anu.action === 'add') {
      let member = anu.participants[0]
      let num = member.split('@')[0]
      await sock.sendMessage(anu.id, {
        text: `Karibu sana @${num} kwenye LOVERS CONNECTION ❤️🔥\nTuletee vibe! Sisi ni family 😎`,
        mentions: [member]
      })
    }
  })
}

startBot()
