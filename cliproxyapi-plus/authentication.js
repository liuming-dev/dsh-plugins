import { AUTH_CLIENTS } from './contract.js'

export function authenticationClients(settings, auth, dashboard) {
  return AUTH_CLIENTS.map(client => {
    const accounts = (auth?.accounts || []).filter(account => account.type === client || (!account.type && client === 'qoder'))
    const runtime = (dashboard?.credentials || []).filter(credential => (credential.type || credential.provider || '').toLowerCase() === client)
    const usable = accounts.some(account => account.status === 'authenticated'
      && !runtime.some(credential => credential.name === account.fileName && credential.requiresSignIn))
    let status = 'unknown'
    if (usable) status = 'authenticated'
    else if (runtime.some(credential => credential.requiresSignIn)) status = 'expired'
    else if (auth?.ok) status = accounts.length ? accounts[0].status : 'missing'
    const selected = settings.authClients.includes(client)
    const needsAuthentication = ['missing', 'expired', 'invalid', 'incomplete'].includes(status)
    return {
      client, label: client === 'qoder' ? 'Qoder' : 'Codex', selected, status, needsAuthentication,
      command: selected && needsAuthentication && settings.startCommand ? `${settings.startCommand} --${client}-login` : '',
    }
  })
}
