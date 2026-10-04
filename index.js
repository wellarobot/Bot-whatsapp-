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

  if (!sock.authState.creds.registered) {
    setTimeout(async () => {
      let code = await sock.requestPairingCode("255749520061")
      console.log(`\n\n🔑 CODE YAKO: ${code} \n\nWeka hii WhatsApp > Linked Devices > Link with phone number\n\n`)
    }, 3000)
  }

  sock.ev.on('connection.update', (u) => {
    if (u.connection === 'open') console.log('✅ LOVERS BOT IKO ONLINE! Karibu inafanya kazi!')
  })

  sock.ev.on('group-participants.update', async (anu) => {
    if (anu.action === 'add') {
      let member = anu.participants[0]
      let num = member.split('@')[0]
      await sock.sendMessage(anu.id, {
        text: `Karibu sana @${num} kwenye LOVERS CONNECTION ❤️🔥\n\n🔥 Tuletee vibe mzee!\n😎 Sisi ni family, heshimu kila mtu`,
        mentions: [member]
      })
    }
  })
}
startBot()
