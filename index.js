const { default: makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys')
const qrcode = require('qrcode-terminal')
const pino = require('pino')

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState('session')
  const sock = makeWASocket({
    auth: state,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: true
  })
  sock.ev.on('creds.update', saveCreds)
  sock.ev.on('connection.update', (u) => {
    if (u.connection === 'open') console.log('✅ BOT IKO ONLINE!')
  })
  sock.ev.on('group-participants.update', async (anu) => {
    if (anu.action === 'add') {
      let num = anu.participants[0].split('@')[0]
      let text = `Karibu sana @${num} kwenye LOVERS CONNECTION ❤️🔥\n\nTuletee vibe mzee! Sisi ni family 😎`
      await sock.sendMessage(anu.id, { text, mentions: anu.participants })
    }
  })
}
startBot()
