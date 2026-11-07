import { PluginError } from './contract.js'

export async function fetchManagementJson(baseUrl, password, path, { fetchImpl = globalThis.fetch, signal, method = 'GET', body, timeoutMs = 4000 } = {}) {
  let response
  try {
    const timeout = AbortSignal.timeout(timeoutMs)
    response = await fetchImpl(`${baseUrl.replace(/\/+$/, '')}/v8/management/${path}`, {
      method,
      redirect: 'error',
      headers: { Authorization: `Bearer ${password}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    })
  } catch {
    signal?.throwIfAborted()
    throw new PluginError('management-unreachable', '无法连接管理接口。')
  }
  const status = Number(response?.status) || 0
  if (!response?.ok) {
    const unauthorized = status === 401 || status === 403
    throw new PluginError(
      unauthorized ? 'management-unauthorized' : 'management-unavailable',
      unauthorized ? '管理接口认证失败，请检查管理密码。' : `管理接口暂不可用（HTTP ${status}）。`,
      { status },
    )
  }
  try {
    return await response.json()
  } catch {
    throw new PluginError('management-unreachable', '无法读取管理接口响应。')
  }
}
