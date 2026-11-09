window.__ModuleLoader__.load({
  id: 'cliproxyapi-plus',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useCallback, useEffect, useLayoutEffect, useRef, useState } = React
    const NS = 'cliproxyapi-plus'
    const PANEL_ID = 'cliproxyapi-plus'
    const NAMESPACE = 'cliproxyapiPlus'
    const codec = name => ({ mode: 'strict', typeSymbol: `cliproxyapi-plus#${name}`, create: () => ({ parse: value => value }) })
    const requestMethods = ['validateConfig', 'saveConfig', 'updateSettings', 'saveManagementCredential', 'credentialModels', 'credentialDetails', 'credentialQuota', 'refreshCredentialQuota']
    const methods = ['snapshot', 'readConfig', 'validateConfig', 'saveConfig', 'updateSettings', 'start', 'stop', 'authenticate', 'stopAuthentication', 'saveManagementCredential', 'copyManagementCredential', 'credentialModels', 'credentialDetails', 'credentialQuota', 'refreshCredentialQuota']
    const CLIENT_REMOTE = {
      package: 'cliproxyapi-plus',
      descriptors: methods.map(method => ({
        id: `${NAMESPACE}/${method}`, service: NAMESPACE, namespace: NAMESPACE, method,
        invocation: { kind: 'direct' },
        parameters: requestMethods.includes(method)
          ? [{ name: 'request', wire: 'request', source: 'json', codec: codec(`${method}Request`) }] : [],
        cancellation: { parameter: 'signal' }, result: codec(`${method}Result`),
      })),
    }

    const ZH = {
      'meta.title': 'CLI Proxy',
      'meta.subtitle': 'CLI Proxy API 代理控制台',
      'meta.source': '本插件开源地址', 'meta.thanks': '感谢开源项目',
      'nav.overview': '仪表盘', 'nav.authFiles': '凭证', 'nav.configuration': '配置', 'nav.activity': '运行日志',
      'action.refresh': '刷新', 'action.start': '一键启动', 'action.stop': '停止服务',
      'action.authenticate': '一键认证', 'action.reauthenticate': '重新认证', 'action.stopAuthentication': '停止认证',
      'action.openOfficial': '打开官方面板', 'action.saveSettings': '保存设置', 'action.saveYaml': '保存 YAML',
      'action.reload': '重新加载', 'action.validate': '校验 YAML', 'action.overwrite': '覆盖外部修改',
      'action.copy': '复制地址', 'action.copied': '已复制',
      'hero.eyebrow': 'LOCAL CONTROL PLANE', 'hero.title': '让本地模型代理，清晰可见。',
      'hero.description': '直接读取本机配置与认证状态。无需管理密钥，也无需登录官方控制面板。',
      'status.running': '运行中', 'status.stopped': '未运行', 'status.starting': '启动中', 'status.stopping': '停止中',
      'status.exited': '已退出', 'status.failed': '异常退出', 'status.reachable': '面板可达', 'status.unreachable': '服务未连接',
      'status.unavailable': 'HTTP 异常', 'status.unknown': '状态未知', 'status.authenticated': '已认证',
      'status.missing': '未认证', 'status.attention': '需要处理', 'status.error': '读取失败', 'status.expired': '已过期',
      'status.invalid': '文件无效', 'status.incomplete': '凭据不完整',
      'overview.service': '代理服务', 'overview.auth': 'Qoder 认证', 'overview.config': '配置文件', 'overview.accounts': '认证账号',
      'overview.endpoint': '服务地址', 'overview.version': '配置版本', 'overview.apiKeys': 'API Key 数量',
      'overview.noAccounts': '尚未发现 Qoder 认证文件。完成一次认证后，账号会显示在这里。',
      'overview.modified': '修改时间', 'overview.expires': '凭据有效期', 'overview.never': '未记录',
      'overview.localData': '本地数据 · 令牌已隐藏', 'overview.logPreview': '最近输出', 'overview.noLog': '启动服务后，输出会显示在这里。',
      'settings.title': '运行设置', 'settings.description': '路径和命令保存在当前 DSH Profile 中。修改设置会重载插件，并停止由插件启动的进程。',
      'settings.configPath': '配置文件路径', 'settings.startCommand': '启动命令', 'settings.authCommand': '认证命令',
      'settings.authClients': '认证 CLI 客户端', 'settings.authClientsHint': '仅认证所选客户端中未认证或已失效的客户端，按 Qoder、Codex 顺序执行。',
      'settings.authPreview': '查看生成的认证命令', 'settings.authPreviewEmpty': '选择客户端后显示对应的认证命令。',
      'settings.authPreviewCommand': '填写启动命令后生成认证命令。',
      'settings.authPreviewHint': '执行时会重新检查认证状态。', 'settings.authPreviewDraft': '当前为未保存的配置预览，保存后生效。',
      'settings.authSkip': '已认证，将跳过', 'settings.authPending': '待认证', 'settings.authUnknown': '状态待确认',
      'settings.dirty': '有未保存修改', 'settings.saving': '正在保存…',
      'settings.configPathPlaceholder': '您的代理配置文件，绝对路径',
      'settings.startCommandPlaceholder': '启动 CLIProxyAPIPlus 代理的命令',
      'settings.authCommandPlaceholder': 'CLIProxyAPIPlus 代理本地 CLI 工具的认证命令',
      'settings.managementUrl': '官方面板地址（可选）', 'settings.managementHint': '留空时根据 YAML 中的 server.host 和 server.port 自动推导。',
      'editor.title': 'YAML 编辑器', 'editor.description': '保留注释与原始格式；保存前自动校验，并创建 .bak 备份。',
      'editor.configurePath': '填写并保存代理配置文件路径后，即可查看和编辑 YAML。',
      'editor.clean': '已与磁盘同步', 'editor.dirty': '有未保存修改', 'editor.valid': 'YAML 格式有效',
      'editor.conflict': '磁盘文件已变化。重新加载可保留磁盘版本，覆盖会保留当前编辑内容。',
      'confirm.reload': '放弃未保存的修改并重新加载？',
      'activity.service': '服务输出', 'activity.authentication': '认证输出', 'activity.empty': '暂无输出。',
      'notice.settingsSaved': '运行设置已保存。', 'notice.yamlSaved': 'YAML 已保存，并创建备份。', 'notice.valid': 'YAML 校验通过。',
      'notice.started': '启动命令已执行。', 'notice.stopped': '服务已停止。', 'notice.authStarted': '认证流程已启动，请查看认证输出中的登录链接。',
      'notice.authStopped': '认证流程已停止。',
      'error.notReady': '插件服务尚未就绪，请稍后重试。', 'error.generic': '操作失败，请重试。',
      'label.loading': '正在读取本地状态…', 'label.authDir': '认证目录', 'label.command': '命令',
      'label.process': '插件托管进程', 'label.external': '外部服务状态', 'label.lastRefresh': '上次刷新',
      'dashboard.good': '运行平稳', 'dashboard.warning': '略有波动', 'dashboard.critical': '需要留意', 'dashboard.idle': '静候流量',
      'dashboard.offline': '等待连接', 'dashboard.handled': '已处理请求', 'dashboard.live': '实时',
      'dashboard.window': '滚动 {minutes} 分钟 · 每桶 10 分钟', 'dashboard.successRate': '成功率', 'dashboard.success': '成功', 'dashboard.failed': '失败',
      'dashboard.trafficTitle': '请求趋势',
      'dashboard.trafficDescription': '保留上游 10 分钟原始分桶，悬停或聚焦可查看成功与失败次数。',
      'dashboard.noTraffic': '暂无流量数据', 'dashboard.noTrafficHint': '代理处理首个请求后即会出现计数。',
      'dashboard.table': '数据表', 'dashboard.bucketTime': '时间段', 'dashboard.total': '总请求', 'dashboard.offlineHint': '启动或连接服务后加载官方用量。',
      'dashboard.needsKey': '输入管理密码以加载官方用量', 'dashboard.needsKeyHint': '仅验证一次并保存到 DSH 凭据服务；不会显示在页面或写入插件配置。',
      'dashboard.password': '管理密码', 'dashboard.passwordPlaceholder': '输入 management.secret-key 的明文', 'dashboard.savePassword': '验证并保存',
      'dashboard.copyPassword': '复制管理密码', 'dashboard.passwordCopied': '管理密码已复制。', 'dashboard.passwordSaved': '管理密码已验证并保存。',
      'dashboard.keyConfigured': '密码已由 DSH 安全托管', 'dashboard.authTitle': '凭证', 'dashboard.authDescription': '查看账号状态、可用模型、额度与请求记录。',
      'dashboard.searchAuth': '搜索账号、文件名或类型', 'dashboard.noAuthResults': '没有匹配的凭证', 'dashboard.readOnly': '只读',
      'dashboard.requests': '请求记录', 'dashboard.modified': '修改时间', 'dashboard.size': '大小', 'dashboard.noRecent': '暂无请求记录',
      'dashboard.localOnly': '管理接口未连接，当前显示本地文件摘要。', 'dashboard.disabled': '已禁用', 'dashboard.unavailable': '不可用',
      'dashboard.active': '可用', 'dashboard.byProvider': '供应商', 'dashboard.viewAuth': '查看认证文件',
      'traffic.hour': '近 1 小时', 'traffic.full': '近 200 分钟', 'traffic.window': '统计窗口',
      'traffic.average': '平均每分钟', 'traffic.peak': '分桶峰值', 'traffic.ago': '{minutes} 分钟前', 'traffic.now': '现在',
      'credentials.all': '全部', 'credentials.models': '模型', 'credentials.details': '文件详情',
      'credentials.close': '关闭', 'credentials.retry': '重试', 'credentials.modelSearch': '搜索模型',
      'credentials.noModels': '当前凭证没有可用模型。', 'credentials.modelsCount': '{count} 个模型',
      'credentials.noModelResults': '没有匹配的模型。',
      'credentials.modelId': '模型 ID', 'credentials.modelName': '显示名称',
      'credentials.redacted': '敏感字段已隐藏。', 'credentials.records': '查看请求记录',
      'credentials.requestsHint': '最近 200 分钟 · 20 个原始分桶', 'credentials.totalRequests': '累计请求',
      'credentials.statusFilter': '凭证状态', 'credentials.issues': '需要处理',
      'quota.title': '额度', 'quota.refresh': '刷新额度', 'quota.loading': '正在刷新…',
      'quota.remaining': '剩余', 'quota.used': '已使用', 'quota.org': '组织资源剩余',
      'quota.unknown': '暂无额度快照', 'quota.unknownHint': '提供方同步额度后显示。',
      'quota.snapshot': '服务端快照 · 随模型同步更新', 'quota.checked': '已读取 {time}',
      'quota.expires': '{time} 到期', 'quota.exceeded': '额度已用尽',
      'quota.package': '套餐内 Credits', 'quota.shared': '组织共享额度', 'quota.usage': '用量',
      'quota.usedPercent': '已使用 {percent}%', 'quota.unknownUsage': '用量比例未提供', 'quota.unknownTotal': '尚未提供总量，剩余值按已知数据展示。',
      'quota.resets': '将于 {time} 刷新', 'quota.reading': '正在读取最新额度…', 'quota.updated': '更新于 {time}',
      'authentication.title': 'CLI 认证', 'authentication.inProgress': '认证进行中…',
      'authentication.validHint': '所选客户端的凭证有效，无需重新认证。',
      'authentication.unknownHint': '尚未确认认证状态，请检查配置和凭证目录。',
      'authentication.configureHint': '请先保存配置文件路径、启动命令，并选择认证 CLI 客户端。',
      'authentication.pending': '待认证：{clients}',
      'codex.plan': '套餐', 'codex.renews': '续期 {time}', 'codex.credits': 'Credits 余额', 'codex.unlimited': '无限额',
      'codex.resets': '可用重置次数', 'codex.resetExpiry': '重置次数有效期', 'codex.resetNumber': '第 {number} 次',
      'codex.fiveHour': '5 小时限额', 'codex.weekly': '周限额', 'codex.monthly': '月度限额', 'codex.custom': '{hours} 小时限额',
      'codex.review': '代码审查', 'codex.noWindows': '暂无用量窗口', 'codex.partial': '部分附加信息暂不可用，可刷新重试。',
      'authentication.waiting': '请在浏览器中完成登录。若未自动打开，可点击下面输出中的登录链接。',
      'authentication.failed': '认证未完成，请查看输出后重试。', 'authentication.finished': '认证命令已结束，凭证列表会自动更新。',
    }
    const EN = {
      'meta.title': 'CLI Proxy', 'meta.subtitle': 'CLI Proxy API console',
      'meta.source': 'Plugin source code', 'meta.thanks': 'thanks to',
      'nav.overview': 'Dashboard', 'nav.authFiles': 'Credentials', 'nav.configuration': 'Configuration', 'nav.activity': 'Activity',
      'action.refresh': 'Refresh', 'action.start': 'Start server', 'action.stop': 'Stop server',
      'action.authenticate': 'Authenticate', 'action.reauthenticate': 'Reauthenticate', 'action.stopAuthentication': 'Stop authentication',
      'action.openOfficial': 'Open official panel', 'action.saveSettings': 'Save settings', 'action.saveYaml': 'Save YAML',
      'action.reload': 'Reload', 'action.validate': 'Validate YAML', 'action.overwrite': 'Overwrite external changes',
      'action.copy': 'Copy address', 'action.copied': 'Copied',
      'hero.eyebrow': 'LOCAL CONTROL PLANE', 'hero.title': 'Your local model proxy, made visible.',
      'hero.description': 'Reads local configuration and authentication state directly. No management key or official-panel sign-in required.',
      'status.running': 'Running', 'status.stopped': 'Stopped', 'status.starting': 'Starting', 'status.stopping': 'Stopping',
      'status.exited': 'Exited', 'status.failed': 'Failed', 'status.reachable': 'Panel reachable', 'status.unreachable': 'Not connected',
      'status.unavailable': 'HTTP error', 'status.unknown': 'Unknown', 'status.authenticated': 'Authenticated',
      'status.missing': 'Not authenticated', 'status.attention': 'Needs attention', 'status.error': 'Read failed', 'status.expired': 'Expired',
      'status.invalid': 'Invalid file', 'status.incomplete': 'Incomplete credentials',
      'overview.service': 'Proxy server', 'overview.auth': 'Qoder authentication', 'overview.config': 'Configuration file', 'overview.accounts': 'Authenticated accounts',
      'overview.endpoint': 'Endpoint', 'overview.version': 'Config version', 'overview.apiKeys': 'API keys',
      'overview.noAccounts': 'No Qoder authentication file found. Authenticate once to see the account here.',
      'overview.modified': 'Modified', 'overview.expires': 'Credential expiry', 'overview.never': 'Not recorded',
      'overview.localData': 'Local data · tokens hidden', 'overview.logPreview': 'Recent output', 'overview.noLog': 'Server output will appear here after startup.',
      'settings.title': 'Runtime settings', 'settings.description': 'Paths and commands are saved in the current DSH Profile. Saving reloads the plugin and stops plugin-owned processes.',
      'settings.configPath': 'Configuration path', 'settings.startCommand': 'Start command', 'settings.authCommand': 'Authentication command',
      'settings.authClients': 'Authentication CLI clients', 'settings.authClientsHint': 'Authenticate selected clients with missing or invalid credentials, in Qoder then Codex order.',
      'settings.authPreview': 'View generated authentication commands', 'settings.authPreviewEmpty': 'Select clients to preview their authentication commands.',
      'settings.authPreviewCommand': 'Enter a start command to generate authentication commands.',
      'settings.authPreviewHint': 'Authentication status is checked again before execution.', 'settings.authPreviewDraft': 'Preview of unsaved settings. Save to apply.',
      'settings.authSkip': 'Authenticated, will skip', 'settings.authPending': 'Needs authentication', 'settings.authUnknown': 'Status not yet confirmed',
      'settings.dirty': 'Unsaved changes', 'settings.saving': 'Saving…',
      'settings.configPathPlaceholder': 'Absolute path to your proxy configuration file',
      'settings.startCommandPlaceholder': 'Command to start the CLIProxyAPIPlus proxy',
      'settings.authCommandPlaceholder': 'Authentication command for the local CLIProxyAPIPlus CLI',
      'settings.managementUrl': 'Official panel URL (optional)', 'settings.managementHint': 'Leave empty to derive it from server.host and server.port in YAML.',
      'editor.title': 'YAML editor', 'editor.description': 'Preserves comments and formatting; validates before saving and creates a .bak backup.',
      'editor.configurePath': 'Enter and save the proxy configuration path to view and edit YAML.',
      'editor.clean': 'In sync with disk', 'editor.dirty': 'Unsaved changes', 'editor.valid': 'Valid YAML',
      'editor.conflict': 'The file changed on disk. Reload to keep the disk version, or overwrite to keep your edits.',
      'confirm.reload': 'Discard unsaved changes and reload?',
      'activity.service': 'Server output', 'activity.authentication': 'Authentication output', 'activity.empty': 'No output yet.',
      'notice.settingsSaved': 'Runtime settings saved.', 'notice.yamlSaved': 'YAML saved with a backup.', 'notice.valid': 'YAML validation passed.',
      'notice.started': 'Start command launched.', 'notice.stopped': 'Server stopped.', 'notice.authStarted': 'Authentication started. Check its output for a sign-in link.',
      'notice.authStopped': 'Authentication stopped.',
      'error.notReady': 'The plugin service is not ready yet.', 'error.generic': 'The operation failed. Try again.',
      'label.loading': 'Reading local state…', 'label.authDir': 'Authentication directory', 'label.command': 'Command',
      'label.process': 'Plugin-owned process', 'label.external': 'External service status', 'label.lastRefresh': 'Last refreshed',
      'dashboard.good': 'Running smoothly', 'dashboard.warning': 'Minor fluctuations', 'dashboard.critical': 'Needs attention', 'dashboard.idle': 'Waiting for traffic',
      'dashboard.offline': 'Waiting for connection', 'dashboard.handled': 'Handled requests', 'dashboard.live': 'Live',
      'dashboard.window': 'Rolling {minutes} minutes · 10-minute buckets', 'dashboard.successRate': 'Success rate', 'dashboard.success': 'Succeeded', 'dashboard.failed': 'Failed',
      'dashboard.trafficTitle': 'Request trend',
      'dashboard.trafficDescription': 'Original 10-minute source buckets. Hover or focus a bar for successful and failed requests.',
      'dashboard.noTraffic': 'No traffic yet', 'dashboard.noTrafficHint': 'Counts appear after the proxy handles its first request.',
      'dashboard.table': 'Data table', 'dashboard.bucketTime': 'Time range', 'dashboard.total': 'Total requests', 'dashboard.offlineHint': 'Start or connect to the server to load official usage.',
      'dashboard.needsKey': 'Enter the management password to load official usage', 'dashboard.needsKeyHint': 'Verified once and stored in the DSH credential service. It is never displayed or added to plugin configuration.',
      'dashboard.password': 'Management password', 'dashboard.passwordPlaceholder': 'Plaintext management.secret-key', 'dashboard.savePassword': 'Verify and save',
      'dashboard.copyPassword': 'Copy management password', 'dashboard.passwordCopied': 'Management password copied.', 'dashboard.passwordSaved': 'Management password verified and saved.',
      'dashboard.keyConfigured': 'Password securely managed by DSH', 'dashboard.authTitle': 'Credentials', 'dashboard.authDescription': 'Account status, available models, quota, and request history.',
      'dashboard.searchAuth': 'Search accounts, filenames, or types', 'dashboard.noAuthResults': 'No matching credentials', 'dashboard.readOnly': 'Read-only',
      'dashboard.requests': 'Requests', 'dashboard.modified': 'Modified', 'dashboard.size': 'Size', 'dashboard.noRecent': 'No recent requests',
      'dashboard.localOnly': 'The management API is disconnected. Showing local file summaries.', 'dashboard.disabled': 'Disabled', 'dashboard.unavailable': 'Unavailable',
      'dashboard.active': 'Active', 'dashboard.byProvider': 'Providers', 'dashboard.viewAuth': 'View authentication files',
      'traffic.hour': 'Last hour', 'traffic.full': 'Last 200 minutes', 'traffic.window': 'Time window',
      'traffic.average': 'Average per minute', 'traffic.peak': 'Peak per bucket', 'traffic.ago': '{minutes} minutes ago', 'traffic.now': 'Now',
      'credentials.all': 'All', 'credentials.models': 'Models', 'credentials.details': 'File details',
      'credentials.close': 'Close', 'credentials.retry': 'Retry', 'credentials.modelSearch': 'Search models',
      'credentials.noModels': 'No models are available for this credential.', 'credentials.modelsCount': '{count} models',
      'credentials.noModelResults': 'No matching models.',
      'credentials.modelId': 'Model ID', 'credentials.modelName': 'Display name',
      'credentials.redacted': 'Sensitive fields are hidden.', 'credentials.records': 'View request history',
      'credentials.requestsHint': 'Last 200 minutes · 20 original buckets', 'credentials.totalRequests': 'Lifetime requests',
      'credentials.statusFilter': 'Credential status', 'credentials.issues': 'Needs attention',
      'quota.title': 'Quota', 'quota.refresh': 'Refresh quota', 'quota.loading': 'Refreshing…',
      'quota.remaining': 'Remaining', 'quota.used': 'Used', 'quota.org': 'Organization balance',
      'quota.unknown': 'No quota snapshot', 'quota.unknownHint': 'Available after the provider syncs quota.',
      'quota.snapshot': 'Server snapshot · updated during model sync', 'quota.checked': 'Read at {time}',
      'quota.expires': 'Expires {time}', 'quota.exceeded': 'Quota exhausted',
      'quota.package': 'Plan Credits', 'quota.shared': 'Shared Add-on Credits', 'quota.usage': 'Usage',
      'quota.usedPercent': '{percent}% used', 'quota.unknownUsage': 'Usage ratio unavailable', 'quota.unknownTotal': 'Total capacity is unavailable. The known balance is shown.',
      'quota.resets': 'Refreshes {time}', 'quota.reading': 'Reading the latest quota…', 'quota.updated': 'Updated {time}',
      'authentication.title': 'CLI authentication', 'authentication.inProgress': 'Authenticating…',
      'authentication.validHint': 'Credentials for the selected clients are valid. Authentication is already complete.',
      'authentication.unknownHint': 'Authentication status is unknown. Check the configuration and credential directory.',
      'authentication.configureHint': 'Save the configuration path and start command, then select authentication CLI clients.',
      'authentication.pending': 'Needs authentication: {clients}',
      'codex.plan': 'Plan', 'codex.renews': 'Renews {time}', 'codex.credits': 'Credits balance', 'codex.unlimited': 'Unlimited',
      'codex.resets': 'Available resets', 'codex.resetExpiry': 'Reset credit expiry', 'codex.resetNumber': 'Reset {number}',
      'codex.fiveHour': '5-hour limit', 'codex.weekly': 'Weekly limit', 'codex.monthly': 'Monthly limit', 'codex.custom': '{hours}-hour limit',
      'codex.review': 'Code review', 'codex.noWindows': 'No usage windows available', 'codex.partial': 'Some additional information is unavailable. Refresh to retry.',
      'authentication.waiting': 'Complete sign-in in your browser. If it did not open, use the login link in the output below.',
      'authentication.failed': 'Authentication did not complete. Review the output and retry.', 'authentication.finished': 'The authentication command ended. The credential list updates automatically.',
    }

    let translate = key => ZH[key] || EN[key] || key
    let remoteClient
    let remoteReady
    const t = (key, params = undefined) => {
      let value = translate(key) || key
      if (params) for (const [name, replacement] of Object.entries(params)) value = value.replaceAll(`{${name}}`, String(replacement))
      return value
    }

    async function call(method, request) {
      if (!remoteReady) throw new Error(t('error.notReady'))
      await remoteReady
      if (!remoteClient || typeof remoteClient[method] !== 'function') throw new Error(t('error.notReady'))
      const response = await remoteClient[method](...(request === undefined ? [] : [request]))
      if (response?.ok === false && response.error) throw new Error(response.error.message || response.error)
      const value = response && Object.prototype.hasOwnProperty.call(response, 'value') ? response.value : response
      if (value?.ok === false && value.code) {
        const error = new Error(value.message || t('error.generic'))
        error.code = value.code
        error.details = value.details
        throw error
      }
      return value
    }

    const ICONS = {
      play: 'M5 3.5 12 8l-7 4.5z', stop: 'M4 4h8v8H4z', refresh: 'M13 4v3h-3M13 5a6 6 0 1 0 1 7',
      key: 'M9.5 9.5 14 14m-2-2 1.5-1.5M9 9a4 4 0 1 0-2 2L10 8M6.5 6.5h.01',
      external: 'M9 3h5v5M14 3 8 9M12 9v4H3V4h4', gear: 'M8 2v2m0 8v2M2 8h2m8 0h2M4 4l1.5 1.5m5 5L12 12m0-8-1.5 1.5m-5 5L4 12',
      check: 'm3 8 3 3 6-7', alert: 'M8 2 15 14H1zM8 6v4m0 2h.01', file: 'M4 2h5l3 3v9H4zM9 2v4h3',
      copy: 'M5 5h8v9H5zM3 11V2h8', terminal: 'm2 4 4 4-4 4m6 0h6', plus: 'M8 3v10M3 8h10',
      close: 'm4 4 8 8M12 4l-8 8', models: 'M8 2v4M3 10V6h10v4M1 10h4v4H1zM6 10h4v4H6zM11 10h4v4h-4z',
    }
    function Icon({ name, size = 16, className = '' }) {
      return h('svg', { width: size, height: size, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.35, strokeLinecap: 'round', strokeLinejoin: 'round', className, 'aria-hidden': true }, h('path', { d: ICONS[name] || ICONS.file }))
    }
    function BrandMark({ size = 24 }) {
      return h('svg', { width: size, height: size, viewBox: '0 0 32 32', fill: 'none', 'aria-hidden': true }, [
        h('rect', { key: 'r', x: 2, y: 2, width: 28, height: 28, rx: 8, fill: '#d97757' }),
        h('path', { key: 'p1', d: 'M9 10h6a4 4 0 0 1 0 8H9zM9 10v14', stroke: '#faf9f5', strokeWidth: 2.2 }),
        h('path', { key: 'p2', d: 'M20 10v8m-4-4h8', stroke: '#141413', strokeWidth: 2.2, strokeLinecap: 'round' }),
      ])
    }
    function Button({ icon, children, primary = false, danger = false, className = '', ...props }) {
      return h('button', { type: 'button', className: `cpa-button ${primary ? 'cpa-button--primary' : ''} ${danger ? 'cpa-button--danger' : ''} ${className}`, ...props },
        icon ? h(Icon, { name: icon, size: 14 }) : null, h('span', null, children))
    }
    function Status({ value, label }) {
      return h('span', { className: `cpa-status cpa-status--${value || 'unknown'}` }, h('i', { 'aria-hidden': true }), label || t(`status.${value}`))
    }
    function formatTime(value) {
      if (!value) return t('overview.never')
      try { return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) } catch { return String(value) }
    }
    function Linkified({ text }) {
      const parts = String(text || '').split(/(https?:\/\/[^\s<>"']+)/g)
      return parts.map((part, index) => /^https?:\/\//.test(part)
        ? h('a', { key: index, href: part.replace(/[),.;]+$/, ''), target: '_blank', rel: 'noreferrer noopener' }, part)
        : h(React.Fragment, { key: index }, part))
    }

    function YamlEditor({ value, onChange, onSave, label }) {
      const hostRef = useRef(null)
      const editorRef = useRef(null)
      const handlersRef = useRef({ onChange, onSave })
      const [state, setState] = useState('loading')
      handlersRef.current = { onChange, onSave }
      useEffect(() => {
        let disposed = false
        if (typeof require.async !== 'function') { setState('fallback'); return undefined }
        require.async('./client.editor.js').then(module => {
          if (disposed || !hostRef.current) return
          editorRef.current = module.createYamlEditor({
            parent: hostRef.current,
            value,
            ariaLabel: label,
            onChange: next => handlersRef.current.onChange(next),
            onSave: () => handlersRef.current.onSave(),
          })
          setState('ready')
        }).catch(error => {
          console.error('[cliproxyapi-plus] editor module failed', error)
          if (!disposed) setState('fallback')
        })
        return () => { disposed = true; editorRef.current?.destroy(); editorRef.current = null }
      }, [])
      useEffect(() => { editorRef.current?.setValue(value) }, [value])
      useEffect(() => { editorRef.current?.setHandlers({ onChange, onSave }) }, [onChange, onSave])
      const onKeyDown = event => {
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') { event.preventDefault(); onSave() }
      }
      return h('div', { className: `cpa-editor cpa-editor--${state}`, 'data-editor-state': state }, [
        h('div', { key: 'host', ref: hostRef, className: 'cpa-editor__codemirror' }),
        state === 'loading' ? h('div', { key: 'loading', className: 'cpa-editor-loading' }, t('label.loading')) : null,
        state === 'fallback' ? h('textarea', {
          key: 'fallback', className: 'cpa-editor__native', value, onChange: event => onChange(event.target.value),
          onKeyDown, spellCheck: false, wrap: 'off', 'aria-label': label,
        }) : null,
      ])
    }

    function Field({ label, hint, children }) {
      return h('label', { className: 'cpa-field' }, h('span', { className: 'cpa-field__label' }, label), children, hint ? h('span', { className: 'cpa-field__hint' }, hint) : null)
    }

    function CommandInput({ value, onChange, placeholder, disabled }) {
      const inputRef = useRef(null)
      const resize = useCallback(() => {
        const input = inputRef.current
        input.style.height = 'auto'
        input.style.height = `${input.scrollHeight + 2}px`
      }, [])
      useLayoutEffect(resize, [value, resize])
      useEffect(() => {
        let previousWidth = 0
        const observer = new ResizeObserver(entries => {
          const width = entries[0].contentRect.width
          if (width === previousWidth) return
          previousWidth = width
          resize()
        })
        observer.observe(inputRef.current)
        return () => observer.disconnect()
      }, [resize])
      return h('textarea', { ref: inputRef, className: 'cpa-start-command', value, onChange,
        placeholder, disabled, rows: 1, spellCheck: false })
    }

    function AuthenticationCommandPreview({ settings, clients, dirty }) {
      const selected = ['qoder', 'codex'].filter(client => settings.authClients?.includes(client))
      const command = settings.startCommand.trim()
      return h('details', { className: 'cpa-command-preview' }, [
        h('summary', { key: 'summary' }, t('settings.authPreview')),
        !selected.length ? h('p', { key: 'empty' }, t('settings.authPreviewEmpty'))
          : !command ? h('p', { key: 'empty' }, t('settings.authPreviewCommand'))
            : h('div', { key: 'commands', className: 'cpa-command-preview__list' }, selected.map(client => {
              const authentication = clients?.find(entry => entry.client === client)
              let statusKey = 'settings.authUnknown'
              if (authentication?.status === 'authenticated') statusKey = 'settings.authSkip'
              else if (authentication?.needsAuthentication) statusKey = 'settings.authPending'
              return h('div', { key: client, className: 'cpa-command-preview__item' }, [
                h('div', { key: 'head', className: 'cpa-command-preview__head' },
                  h('strong', null, client === 'qoder' ? 'Qoder' : 'Codex'), h('span', null, t(statusKey))),
                h('code', { key: 'command' }, `${command} --${client}-login`),
              ])
            })),
        selected.length && command ? h('p', { key: 'hint' }, t(dirty ? 'settings.authPreviewDraft' : 'settings.authPreviewHint')) : null,
      ])
    }

    function LogBlock({ title, log, empty }) {
      const text = (log || '').replace(/\u001b\][\s\S]*?(?:\u0007|\u001b\\)/g, '').replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '')
      return h('section', { className: 'cpa-log' }, [
        h('div', { key: 'head', className: 'cpa-log__head' }, h('span', null, h(Icon, { name: 'terminal', size: 14 }), title)),
        h('pre', { key: 'pre', className: 'cpa-log__body', tabIndex: 0 }, text ? h(Linkified, { text }) : h('span', { className: 'cpa-muted' }, empty || t('activity.empty'))),
      ])
    }

    function percent(value) {
      return typeof value === 'number' && Number.isFinite(value) ? `${value.toFixed(value >= 99.95 ? 0 : 1)}%` : '—'
    }
    function bytes(value) {
      if (!Number.isFinite(value) || value <= 0) return '—'
      if (value < 1024) return `${value} B`
      if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
      return `${(value / 1024 / 1024).toFixed(1)} MB`
    }
    function CredentialGate({ busy, onSave }) {
      const [password, setPassword] = useState('')
      const submit = async event => {
        event.preventDefault()
        if (!password.trim() || busy) return
        if (await onSave(password)) setPassword('')
      }
      return h('form', { className: 'cpa-credential-gate', onSubmit: submit }, [
        h('div', { key: 'copy', className: 'cpa-credential-gate__copy' }, [
          h('h3', { key: 'title' }, t('dashboard.needsKey')),
          h('p', { key: 'hint' }, t('dashboard.needsKeyHint')),
        ]),
        h('label', { key: 'field', className: 'cpa-credential-gate__field' },
          h('span', { className: 'cpa-field__label' }, t('dashboard.password')),
          h('input', { type: 'password', value: password, onChange: event => setPassword(event.target.value), placeholder: t('dashboard.passwordPlaceholder'), autoComplete: 'current-password', required: true })),
        h(Button, { key: 'submit', icon: 'key', primary: true, type: 'submit', disabled: busy || !password.trim() }, t('dashboard.savePassword')),
      ])
    }
    function bucketLabel(bucket, index, length) {
      return bucket.time || (index === length - 1 ? t('traffic.now') : t('traffic.ago', { minutes: (length - index - 1) * 10 }))
    }
    function RequestsTable({ buckets }) {
      return h('table', { className: 'cpa-data-table' }, [
        h('thead', { key: 'head' }, h('tr', null, [
          h('th', { key: 'time' }, t('dashboard.bucketTime')),
          h('th', { key: 'success' }, t('dashboard.success')),
          h('th', { key: 'failed' }, t('dashboard.failed')),
          h('th', { key: 'total' }, t('dashboard.total')),
        ])),
        h('tbody', { key: 'body' }, buckets.map((bucket, index) => h('tr', { key: index }, [
          h('td', { key: 'time' }, bucketLabel(bucket, index, buckets.length)),
          h('td', { key: 'success' }, bucket.success),
          h('td', { key: 'failed' }, bucket.failed),
          h('td', { key: 'total' }, bucket.success + bucket.failed),
        ]))),
      ])
    }
    function TrafficChart({ traffic }) {
      const [windowSize, setWindowSize] = useState(20)
      const [focused, setFocused] = useState(null)
      const buckets = (traffic?.buckets || []).slice(-windowSize)
      const peak = Math.max(0, ...buckets.map(bucket => bucket.success + bucket.failed))
      const maximum = Math.max(3, Math.ceil(peak / 3) * 3)
      const total = buckets.reduce((sum, bucket) => sum + bucket.success + bucket.failed, 0)
      const minutes = buckets.length * 10
      const selected = focused === null ? null : buckets[focused]
      const summary = `${t('dashboard.total')}: ${total}`
      return h('section', { className: 'cpa-traffic' }, [
        h('header', { key: 'head', className: 'cpa-panel__head' }, [
          h('div', { key: 'title' }, h('h2', null, t('dashboard.trafficTitle')), h('p', null, t('dashboard.trafficDescription'))),
          h('div', { key: 'window', className: 'cpa-segmented', role: 'group', 'aria-label': t('traffic.window') }, [6, 20].map(size =>
            h('button', { key: size, type: 'button', 'aria-pressed': size === windowSize,
              onClick: () => { setWindowSize(size); setFocused(null) } }, t(size === 6 ? 'traffic.hour' : 'traffic.full')))),
        ]),
        h('div', { key: 'summary', className: 'cpa-traffic-summary' }, [
          h('span', { key: 'total' }, t('dashboard.total'), h('strong', null, total.toLocaleString())),
          h('span', { key: 'average' }, t('traffic.average'), h('strong', null, minutes ? (total / minutes).toFixed(2) : '—')),
          h('span', { key: 'peak' }, t('traffic.peak'), h('strong', null, total ? peak.toLocaleString() : '—')),
          h('div', { key: 'legend', className: 'cpa-chart-legend' }, [
            h('span', { key: 'success', className: 'is-success' }, t('dashboard.success')),
            h('span', { key: 'failed', className: 'is-failed' }, t('dashboard.failed')),
          ]),
        ]),
        h('div', { key: 'plot', className: 'cpa-traffic__chart', onMouseLeave: () => setFocused(null) }, [
          h('div', { key: 'tooltip', className: 'cpa-chart-tooltip', role: 'status' }, selected
            ? `${bucketLabel(selected, focused, buckets.length)} · ${t('dashboard.success')} ${selected.success} · ${t('dashboard.failed')} ${selected.failed}`
            : !total ? t('dashboard.noTrafficHint') : '\u00a0'),
          h('svg', { key: 'svg', viewBox: '0 0 960 205', role: 'img', 'aria-label': summary }, [
            ...[0, 1, 2, 3].map(step => h('g', { key: `grid-${step}`, className: 'cpa-chart-grid' }, [
              h('text', { key: 'label', x: 34, y: 19 + step * 54, textAnchor: 'end' }, Math.round(maximum * (3 - step) / 3)),
              h('line', { key: 'line', x1: 48, x2: 950, y1: 15 + step * 54, y2: 15 + step * 54 }),
            ])),
            ...buckets.map((bucket, index) => {
              const width = 900 / buckets.length
              const successHeight = bucket.success / maximum * 162
              const failureHeight = bucket.failed / maximum * 162
              const x = 48 + index * width + width * 0.2
              const label = `${bucketLabel(bucket, index, buckets.length)} · ${t('dashboard.success')} ${bucket.success} · ${t('dashboard.failed')} ${bucket.failed}`
              return h('g', { key: index, className: 'cpa-traffic__bucket', tabIndex: 0, role: 'graphics-symbol', 'aria-label': label,
                onMouseEnter: () => setFocused(index), onFocus: () => setFocused(index), onBlur: () => setFocused(null) }, [
                h('title', { key: 'title' }, label),
                h('rect', { key: 'hit', className: 'cpa-chart-hit', x: x - 5, y: 10, width: width * 0.6 + 10, height: 172 }),
                h('rect', { key: 'success', className: 'is-success', x, y: 177 - successHeight, width: width * 0.6, height: Math.max(2, successHeight), rx: 2 }),
                h('rect', { key: 'failed', className: 'is-failed', x, y: 177 - successHeight - failureHeight, width: width * 0.6, height: failureHeight, rx: 2 }),
              ])
            }),
            h('text', { key: 'start', className: 'cpa-chart-axis', x: 48, y: 201 }, buckets.length ? bucketLabel(buckets[0], 0, buckets.length) : ''),
            h('text', { key: 'end', className: 'cpa-chart-axis', x: 950, y: 201, textAnchor: 'end' }, buckets.length ? bucketLabel(buckets.at(-1), buckets.length - 1, buckets.length) : ''),
          ]),
        ]),
        buckets.length ? h('details', { key: 'table', className: 'cpa-traffic__table' },
          h('summary', null, t('dashboard.table')), h(RequestsTable, { buckets })) : null,
      ])
    }
    function MiniRequests({ buckets }) {
      if (!buckets?.length) return h('span', { className: 'cpa-muted' }, t('dashboard.noRecent'))
      return h('div', { className: 'cpa-mini-requests', 'aria-label': t('dashboard.requests') }, buckets.map((bucket, index) =>
        h('i', { key: index, className: bucket.failed ? (bucket.success ? 'is-mixed' : 'is-failed') : bucket.success ? 'is-success' : 'is-idle',
          title: `${bucketLabel(bucket, index, buckets.length)} · ${t('dashboard.success')} ${bucket.success} · ${t('dashboard.failed')} ${bucket.failed}` })))
    }
    function CredentialModal({ selection, onClose }) {
      const dialogRef = useRef(null)
      const [result, setResult] = useState(null)
      const [error, setError] = useState('')
      const [attempt, setAttempt] = useState(0)
      const [query, setQuery] = useState('')
      const modelsMode = selection.mode === 'models'
      useEffect(() => {
        const dialog = dialogRef.current
        const previousFocus = document.activeElement
        dialog.showModal()
        return () => { dialog.close(); previousFocus?.focus() }
      }, [])
      useEffect(() => {
        let active = true
        setResult(null); setError('')
        call(modelsMode ? 'credentialModels' : 'credentialDetails', { name: selection.credential.name })
          .then(value => { if (active) setResult(value) })
          .catch(cause => { if (active) setError(cause.message) })
        return () => { active = false }
      }, [selection, modelsMode, attempt])
      const models = (result?.models || []).filter(model => `${model.id} ${model.name}`.toLowerCase().includes(query.trim().toLowerCase()))
      return h('dialog', { ref: dialogRef, className: 'cpa-dialog', 'aria-labelledby': 'cpa-dialog-title',
        onCancel: event => { event.preventDefault(); onClose() },
        onKeyDown: event => { if (event.key === 'Escape') { event.preventDefault(); onClose() } },
        onClick: event => { if (event.target === event.currentTarget) onClose() } }, h('div', { className: 'cpa-dialog__surface' }, [
        h('header', { key: 'head', className: 'cpa-panel__head' }, [
          h('div', { key: 'identity' }, h('h2', { id: 'cpa-dialog-title' }, t(modelsMode ? 'credentials.models' : 'credentials.details')),
            h('p', null, selection.credential.name)),
          h(Button, { key: 'close', icon: 'close', onClick: onClose, 'aria-label': t('credentials.close') }, t('credentials.close')),
        ]),
        h('div', { key: 'body', className: 'cpa-dialog__body' }, error
          ? h('div', { className: 'cpa-empty', role: 'alert' }, h('p', null, error),
            h(Button, { icon: 'refresh', onClick: () => setAttempt(value => value + 1) }, t('credentials.retry')))
          : !result ? h('div', { className: 'cpa-empty', role: 'status' }, t('label.loading'))
            : modelsMode ? [
              h('div', { key: 'tools', className: 'cpa-model-tools' },
                h('input', { type: 'search', value: query, onChange: event => setQuery(event.target.value), placeholder: t('credentials.modelSearch'), 'aria-label': t('credentials.modelSearch') }),
                h('span', { className: 'cpa-muted' }, t('credentials.modelsCount', { count: models.length }))),
              models.length ? h('table', { key: 'models', className: 'cpa-data-table cpa-model-table' }, [
                h('thead', { key: 'head' }, h('tr', null, h('th', null, t('credentials.modelId')), h('th', null, t('credentials.modelName')))),
                h('tbody', { key: 'body' }, models.map(model => h('tr', { key: model.id },
                  h('td', null, h('code', null, model.id)), h('td', null, model.name)))),
              ]) : h('div', { key: 'empty', className: 'cpa-empty' }, t(query.trim() ? 'credentials.noModelResults' : 'credentials.noModels')),
            ] : [
              h('p', { key: 'note', className: 'cpa-detail-note' }, t('credentials.redacted')),
              h('pre', { key: 'json', className: 'cpa-file-details', tabIndex: 0 }, JSON.stringify(result.content, null, 2)),
            ]),
      ]))
    }
    function QuotaBucket({ bucket, label, className = '', plan }) {
      const amount = value => value === null || value === undefined ? '—' : Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 })
      const usageLabel = bucket.usedPercent === null ? t('quota.unknownUsage') : t('quota.usedPercent', { percent: Number(bucket.usedPercent.toFixed(1)) })
      return h('section', { className: `cpa-quota-bucket ${className}`, 'aria-label': label }, [
        h('div', { key: 'head', className: 'cpa-quota-bucket__head' }, [
          h('strong', { key: 'label' }, label),
          plan ? h('span', { key: 'plan', className: 'cpa-plan-badge' }, plan) : null,
          bucket.resetAt ? h('span', { key: 'reset', className: 'cpa-quota-reset' }, t('quota.resets', { time: formatTime(bucket.resetAt) })) : null,
        ]),
        h('div', { key: 'meter', className: 'cpa-quota-meter', role: 'progressbar',
          'aria-label': label, 'aria-valuemin': 0, 'aria-valuemax': 100,
          'aria-valuenow': bucket.usedPercent === null ? undefined : bucket.usedPercent,
          'aria-valuetext': usageLabel }, h('span', { style: { width: `${bucket.usedPercent ?? 0}%` } })),
        h('div', { key: 'numbers', className: 'cpa-quota-bucket__numbers' }, [
          h('span', { key: 'usage', className: 'cpa-quota-fraction' },
            h('strong', null, amount(bucket.used)), ' / ', amount(bucket.total), h('span', { className: 'cpa-muted' }, ` · ${usageLabel}`)),
          h('span', { key: 'remaining', className: 'cpa-quota-remaining' }, t('quota.remaining'),
            h('strong', { 'data-quota-remaining': '' }, amount(bucket.remaining))),
        ]),
        bucket.total === null ? h('p', { key: 'partial', className: 'cpa-quota-partial' }, t('quota.unknownTotal')) : null,
      ])
    }
    function CodexQuotaDetails({ usage }) {
      if (!usage) return h('p', { className: 'cpa-muted' }, t('quota.unknown'))
      const plans = { pro: 'Pro 200', prolite: 'Pro 100', promax: 'Pro 500', plus: 'Plus', team: 'Team', free: 'Free' }
      return h('div', { className: 'cpa-codex-quota' }, [
        h('div', { key: 'summary', className: 'cpa-codex-summary' }, [
          usage.plan ? h('span', { key: 'plan' }, t('codex.plan'), ' ', h('strong', null, plans[usage.plan] || usage.plan)) : null,
          usage.renewsAt ? h('span', { key: 'renewal' }, t('codex.renews', { time: formatTime(usage.renewsAt) })) : null,
          h('span', { key: 'balance' }, t('codex.credits'), ' ', h('strong', null, usage.unlimitedCredits ? t('codex.unlimited') : usage.creditBalance?.toLocaleString() ?? '—')),
          h('span', { key: 'resets' }, t('codex.resets'), ' ', h('strong', null, usage.resetCount ?? '—')),
        ]),
        usage.resets?.length ? h('details', { key: 'expiry', className: 'cpa-codex-resets' }, h('summary', null, t('codex.resetExpiry')),
          h('ul', null, usage.resets.map((reset, index) => h('li', { key: index },
            h('span', null, t('codex.resetNumber', { number: index + 1 })), h('time', null, formatTime(reset.expiresAt)))))) : null,
        ...(usage.windows || []).map(window => {
          const feature = window.feature === 'review' ? t('codex.review') : window.feature
          const label = `${feature ? `${feature} · ` : ''}${t(`codex.${window.period}`, { hours: window.periodHours })}`
          return h('section', { key: window.id, className: 'cpa-codex-window', 'aria-label': label }, [
            h('div', { key: 'head', className: 'cpa-quota-bucket__head' }, h('strong', null, label),
              window.resetAt ? h('span', { className: 'cpa-quota-reset' }, t('quota.resets', { time: formatTime(window.resetAt) })) : null),
            h('div', { key: 'numbers', className: 'cpa-quota-bucket__numbers' },
              h('span', { className: 'cpa-muted' }, window.usedPercent === null ? t('quota.unknownUsage') : t('quota.usedPercent', { percent: Number(window.usedPercent.toFixed(1)) })),
              h('span', { className: 'cpa-quota-remaining' }, t('quota.remaining'), h('strong', null, window.remainingPercent === null ? '—' : `${Number(window.remainingPercent.toFixed(1))}%`))),
            h('div', { key: 'meter', className: 'cpa-quota-meter', role: 'progressbar', 'aria-label': label,
              'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': window.usedPercent ?? undefined },
              h('span', { style: { width: `${window.usedPercent ?? 0}%` } })),
          ])
        }),
        !usage.windows?.length ? h('p', { key: 'empty', className: 'cpa-muted' }, t('codex.noWindows')) : null,
        usage.partial ? h('p', { key: 'partial', className: 'cpa-quota-partial' }, t('codex.partial')) : null,
      ])
    }
    function QuotaSection({ credential, connected }) {
      const [quota, setQuota] = useState({ usage: credential.usage, pending: false, error: '', checkedAt: null })
      const mounted = useRef(false)
      const latestRequest = useRef(0)
      const isQoder = (credential.type || credential.provider || '').toLowerCase() === 'qoder'
      const isCodex = (credential.type || credential.provider || '').toLowerCase() === 'codex'
      const hasLiveQuota = isQoder || isCodex
      const loadQuota = async (refresh = false) => {
        const requestId = ++latestRequest.current
        setQuota(current => ({ ...current, pending: true, error: '' }))
        try {
          const value = await call(refresh ? 'refreshCredentialQuota' : 'credentialQuota', { name: credential.name })
          if (mounted.current && latestRequest.current === requestId) {
            setQuota({ usage: value.usage, pending: false, error: '', checkedAt: value.observedAt })
          }
        } catch (cause) {
          if (mounted.current && latestRequest.current === requestId) setQuota(current => ({ ...current, pending: false, error: cause.message }))
        }
      }
      useEffect(() => {
        mounted.current = true
        return () => { mounted.current = false; latestRequest.current += 1 }
      }, [])
      useEffect(() => {
        if (connected && hasLiveQuota) loadQuota()
      }, [connected, hasLiveQuota, credential.name, credential.modified])
      useEffect(() => {
        if (!hasLiveQuota) setQuota(current => ({ ...current, usage: credential.usage }))
      }, [credential.usage, hasLiveQuota])
      const usage = quota.usage
      const unknown = { total: null, used: null, remaining: null, usedPercent: null, resetAt: null }
      return h('section', { className: 'cpa-quota', 'aria-label': t('quota.title') }, [
        h('div', { key: 'head', className: 'cpa-quota__head' }, [
          h('strong', { key: 'title' }, t('quota.title')),
          h(Button, { key: 'refresh', icon: 'refresh', onClick: () => loadQuota(true), disabled: !connected || credential.disabled || quota.pending },
            t(quota.pending ? 'quota.loading' : 'quota.refresh')),
        ]),
        isCodex ? h(CodexQuotaDetails, { key: 'codex', usage }) : isQoder || usage ? h('div', { key: 'buckets', className: 'cpa-quota-buckets' }, [
          h(QuotaBucket, { key: 'package', bucket: usage?.package || unknown,
            label: t(isQoder ? 'quota.package' : 'quota.usage'), className: 'cpa-quota-bucket--package', plan: usage?.package?.plan }),
          isQoder || usage?.shared?.remaining != null ? h(QuotaBucket, { key: 'shared', bucket: usage?.shared || unknown,
            label: t('quota.shared'), className: 'cpa-quota-bucket--shared' }) : null,
        ]) : h('p', { key: 'empty', className: 'cpa-muted' }, t('quota.unknown')),
        usage?.exceeded ? h('p', { key: 'exceeded', className: 'cpa-danger' }, t('quota.exceeded')) : null,
        quota.error ? h('p', { key: 'error', className: 'cpa-inline-error', role: 'alert' }, quota.error) : null,
        h('p', { key: 'source', className: 'cpa-quota__source', role: 'status' }, quota.pending ? t('quota.reading')
          : quota.checkedAt ? t('quota.updated', { time: formatTime(quota.checkedAt) }) : t('quota.snapshot')),
      ])
    }
    function AuthenticationPanel({ authentication, busy, onStop }) {
      const active = ['starting', 'running', 'stopping'].includes(authentication.status)
      if (!authentication.log && !active) return null
      return h('section', { className: 'cpa-auth-flow', 'aria-label': t('authentication.title') }, [
        h('header', { key: 'head', className: 'cpa-auth-flow__head' }, [
          h('div', { key: 'title' }, h('h3', null, t('authentication.title')), h(Status, { value: authentication.status })),
          authentication.client ? h('span', { key: 'step', className: 'cpa-muted' }, `${authentication.client === 'qoder' ? 'Qoder' : 'Codex'} · ${authentication.step}/${authentication.total}`) : null,
          active ? h(Button, { key: 'stop', icon: 'stop', disabled: busy || authentication.status === 'stopping', onClick: onStop }, t('action.stopAuthentication')) : null,
        ]),
        h('p', { key: 'hint', className: 'cpa-auth-flow__hint' }, t(active ? 'authentication.waiting' : authentication.status === 'failed' ? 'authentication.failed' : 'authentication.finished')),
        h(LogBlock, { key: 'output', title: t('activity.authentication'), log: authentication.log }),
      ])
    }
    function CredentialCard({ credential, connected, onInspect }) {
      const status = credential.disabled ? 'disabled' : credential.unavailable ? 'unavailable' : 'active'
      const total = credential.success + credential.failed
      return h('article', { className: `cpa-auth-card cpa-auth-card--${status}` }, [
        h('header', { key: 'head', className: 'cpa-auth-card__head' }, [
          h('span', { key: 'provider', className: 'cpa-provider-badge' }, credential.type || credential.provider || '—'),
          h('strong', { key: 'name', title: credential.email || credential.name }, credential.email || credential.name),
          h('span', { key: 'state', className: `cpa-auth-state cpa-auth-state--${status}` }, t(`dashboard.${status}`)),
        ]),
        h('code', { key: 'filename', className: 'cpa-credential-filename' }, credential.name),
        h('div', { key: 'requests', className: 'cpa-auth-card__requests' }, [
          h('div', { key: 'counts', className: 'cpa-request-counts' }, [
            h('span', { key: 'label', title: t('credentials.totalRequests') }, t('dashboard.requests')),
            h('span', { key: 'success', className: 'cpa-success' }, `${t('dashboard.success')} ${credential.success.toLocaleString()}`),
            h('span', { key: 'failed', className: 'cpa-muted' }, `${t('dashboard.failed')} ${credential.failed.toLocaleString()}`),
            h('strong', { key: 'rate' }, percent(total ? credential.success / total * 100 : null)),
          ]),
          h(MiniRequests, { key: 'mini', buckets: credential.recentRequests }),
          credential.recentRequests.length ? h('details', { key: 'records', className: 'cpa-request-records' },
            h('summary', null, t('credentials.records')), h('p', null, t('credentials.requestsHint')),
            h(RequestsTable, { buckets: credential.recentRequests })) : null,
        ]),
        h(QuotaSection, { key: 'quota', credential, connected }),
        credential.statusMessage ? h('p', { key: 'error', className: 'cpa-inline-error' }, credential.statusMessage) : null,
        h('footer', { key: 'footer', className: 'cpa-auth-card__footer' }, [
          h('div', { key: 'actions', className: 'cpa-button-row' }, [
            h(Button, { key: 'models', icon: 'models', disabled: !connected, onClick: () => onInspect('models', credential) }, t('credentials.models')),
            h(Button, { key: 'details', icon: 'file', disabled: !connected, onClick: () => onInspect('details', credential) }, t('credentials.details')),
          ]),
          h('span', { key: 'meta', className: 'cpa-muted', title: formatTime(credential.modified) }, `${bytes(credential.size)} · ${formatTime(credential.modified)}`),
        ]),
      ])
    }
    function AuthFilesView({ dashboard, localAuth, busy, authentication, authActive, authenticationConfigured, onSaveCredential, onAuthenticate, onStopAuthentication }) {
      const [query, setQuery] = useState('')
      const [provider, setProvider] = useState('all')
      const [status, setStatus] = useState('all')
      const [selection, setSelection] = useState(null)
      const connected = dashboard?.status === 'ready'
      const credentials = connected ? dashboard.credentials : (localAuth?.accounts || []).map(account => ({
        id: account.fileName, name: account.fileName, email: account.email, type: account.type || 'qoder', modified: account.modifiedAt,
        disabled: false, unavailable: account.status !== 'authenticated', success: 0, failed: 0, recentRequests: [], usage: null,
      }))
      const providers = [...new Set(credentials.map(credential => credential.type || credential.provider || 'unknown'))]
      const pendingClients = (localAuth?.clients || []).filter(client => client.selected && client.needsAuthentication)
      const authenticationRequired = pendingClients.length > 0
      let authenticationHint
      if (!authenticationConfigured) authenticationHint = t('authentication.configureHint')
      else if (!authenticationRequired) authenticationHint = t(localAuth?.ok ? 'authentication.validHint' : 'authentication.unknownHint')
      const filtered = credentials.filter(credential => {
        const matchesQuery = `${credential.name} ${credential.email} ${credential.type} ${credential.provider} ${credential.statusMessage || ''}`.toLowerCase().includes(query.trim().toLowerCase())
        const matchesProvider = provider === 'all' || provider === (credential.type || credential.provider)
        const matchesStatus = status === 'all' || (status === 'active' ? !credential.disabled && !credential.unavailable : status === 'disabled' ? credential.disabled : credential.unavailable)
        return matchesQuery && matchesProvider && matchesStatus
      })
      return h('div', { className: 'cpa-view cpa-auth-files' }, [
        ['needs-key', 'error'].includes(dashboard?.status) ? h(CredentialGate, { key: 'gate', busy, onSave: onSaveCredential }) : null,
        h('div', { key: 'head', className: 'cpa-view-heading' }, [
          h('div', { key: 'title' }, h('h2', null, t('dashboard.authTitle')), h('p', null, t('dashboard.authDescription'))),
          h(Button, { key: 'auth', icon: 'key', primary: true, disabled: busy || authActive || !authenticationRequired || !authenticationConfigured,
            title: authenticationHint,
            onClick: onAuthenticate }, t(authActive ? 'authentication.inProgress' : 'action.authenticate')),
        ]),
        h(AuthenticationPanel, { key: 'authentication', authentication, busy, onStop: onStopAuthentication }),
        pendingClients.length ? h('p', { key: 'pending', className: 'cpa-muted' }, t('authentication.pending', { clients: pendingClients.map(client => client.label).join('、') })) : null,
        h('div', { key: 'filters', className: 'cpa-auth-tools' }, [
          h('div', { key: 'providers', className: 'cpa-provider-filter', role: 'group', 'aria-label': t('dashboard.byProvider') }, ['all', ...providers].map(value =>
            h('button', { key: value, type: 'button', 'aria-pressed': provider === value, onClick: () => setProvider(value) },
              value === 'all' ? t('credentials.all') : value, h('span', null, value === 'all' ? credentials.length : credentials.filter(credential => (credential.type || credential.provider) === value).length)))),
          h('div', { key: 'search', className: 'cpa-auth-search' }, [
            h('input', { key: 'input', type: 'search', value: query, onChange: event => setQuery(event.target.value), placeholder: t('dashboard.searchAuth'), 'aria-label': t('dashboard.searchAuth') }),
            h('select', { key: 'status', value: status, onChange: event => setStatus(event.target.value), 'aria-label': t('credentials.statusFilter') },
              ['all', 'active', 'disabled', 'issues'].map(value => h('option', { key: value, value }, t(value === 'all' ? 'credentials.all' : value === 'issues' ? 'credentials.issues' : `dashboard.${value}`)))),
          ]),
        ]),
        !connected ? h('p', { key: 'local', className: 'cpa-muted' }, t('dashboard.localOnly')) : null,
        filtered.length ? h('div', { key: 'grid', className: 'cpa-auth-grid' }, filtered.map(credential =>
          h(CredentialCard, { key: credential.id || credential.name, credential, connected,
            onInspect: (mode, item) => setSelection({ mode, credential: item }) })))
          : h('div', { key: 'empty', className: 'cpa-empty' }, t('dashboard.noAuthResults')),
        selection ? h(CredentialModal, { key: `${selection.mode}-${selection.credential.name}`, selection, onClose: () => setSelection(null) }) : null,
      ])
    }

    function useTabMessage(tab) {
      const [message, setMessage] = useState(null)
      useEffect(() => {
        if (!message) return
        const timer = window.setTimeout(() => setMessage(current => current === message ? null : current), 30000)
        return () => window.clearTimeout(timer)
      }, [message])
      const publish = useCallback(text => setMessage(current => {
        if (text) return { tab, text }
        return current?.tab === tab ? null : current
      }), [tab])
      return [message?.tab === tab ? message.text : '', publish]
    }

    function App() {
      const [tab, setTab] = useState('overview')
      const [snapshot, setSnapshot] = useState(null)
      const [loading, setLoading] = useState(true)
      const [busy, setBusy] = useState('')
      const [error, setError] = useTabMessage(tab)
      const [notice, setNotice] = useTabMessage(tab)
      const [document, setDocument] = useState(null)
      const [yaml, setYaml] = useState('')
      const [dirty, setDirty] = useState(false)
      const [validation, setValidation] = useState(null)
      const [conflict, setConflict] = useState(false)
      const [settings, setSettings] = useState({ configPath: '', startCommand: '', authClients: [], managementUrl: '' })
      const [settingsDirty, setSettingsDirty] = useState(false)
      const [settingsFeedback, setSettingsFeedback] = useTabMessage(tab)
      const [copied, setCopied] = useState(false)
      const authentication = snapshot?.processes?.authentication || { status: 'stopped', log: '' }
      const authActive = ['starting', 'running', 'stopping'].includes(authentication.status)
      const mounted = useRef(true)

      const refresh = useCallback(async (quiet = false) => {
        if (!quiet) setLoading(true)
        try {
          const next = await call('snapshot')
          if (!mounted.current) return
          setSnapshot(next)
          if (!settingsDirty) setSettings(next.settings)
        } catch (cause) { if (mounted.current) setError(cause.message) }
        finally { if (mounted.current) setLoading(false) }
      }, [settingsDirty, setError])
      useEffect(() => {
        mounted.current = true
        refresh()
        const timer = window.setInterval(() => refresh(true), authActive ? 1000 : 8000)
        return () => { mounted.current = false; window.clearInterval(timer) }
      }, [refresh, authActive])
      const loadConfig = useCallback(async () => {
        try {
          const next = await call('readConfig')
          if (!mounted.current) return
          setDocument(next); setYaml(next.text); setDirty(false); setConflict(false); setValidation(null); setError('')
        } catch (cause) { if (mounted.current) setError(cause.message) }
      }, [setError])
      const configPath = snapshot?.settings?.configPath || ''
      useEffect(() => { if (tab === 'configuration' && configPath && !document) loadConfig() }, [tab, configPath, document, loadConfig])

      const run = useCallback(async (action, successKey) => {
        setBusy(action); setError(''); setNotice('')
        try { await call(action); if (mounted.current) setNotice(t(successKey)); await refresh(true) }
        catch (cause) { await refresh(true); if (mounted.current) setError(cause.message) }
        finally { if (mounted.current) setBusy('') }
      }, [refresh, setError, setNotice])
      const saveSettings = async () => {
        setBusy('settings'); setError(''); setNotice(''); setSettingsFeedback('')
        try {
          const result = await call('updateSettings', settings)
          if (result.settings.configPath !== configPath) {
            setDocument(null)
            setDirty(false)
            setValidation(null)
          }
          setSettings(result.settings); setSettingsDirty(false)
          setSettingsFeedback({ kind: 'success', text: t('notice.settingsSaved') }); await refresh(true)
        } catch (cause) { setSettingsFeedback({ kind: 'error', text: cause.message }) }
        finally { setBusy('') }
      }
      const validateYaml = async () => {
        setBusy('validate'); setError(''); setNotice('')
        try { setValidation(await call('validateConfig', { text: yaml })); setNotice(t('notice.valid')) }
        catch (cause) { setValidation(null); setError(cause.message) }
        finally { setBusy('') }
      }
      const saveYaml = async (overwrite = false) => {
        setBusy('yaml'); setError(''); setNotice(''); setConflict(false)
        try {
          const next = await call('saveConfig', { text: yaml, expectedMtimeMs: document?.mtimeMs, overwrite })
          setDocument(next); setYaml(next.text); setDirty(false); setValidation({ ok: true }); setNotice(t('notice.yamlSaved')); await refresh(true)
        } catch (cause) {
          if (cause.code === 'config-conflict') setConflict(true)
          setError(cause.message)
        } finally { setBusy('') }
      }
      const reloadYaml = async () => {
        if (dirty && !window.confirm(t('confirm.reload'))) return
        setDocument(null); await loadConfig()
      }
      const changeYaml = value => { setYaml(value); setDirty(true); setValidation(null); setConflict(false); setNotice('') }
      const changeSetting = (key, value) => {
        const next = { ...settings, [key]: value }
        const saved = snapshot.settings
        const fieldsChanged = ['configPath', 'startCommand', 'managementUrl'].some(field => next[field] !== saved[field])
        const clientsChanged = ['qoder', 'codex'].some(client => (next.authClients || []).includes(client) !== (saved.authClients || []).includes(client))
        setSettings(next); setSettingsDirty(fieldsChanged || clientsChanged)
        setNotice(''); setSettingsFeedback('')
      }
      const copyEndpoint = async () => {
        if (!snapshot?.config?.server?.baseUrl) return
        await navigator.clipboard.writeText(snapshot.config.server.baseUrl)
        setCopied(true); window.setTimeout(() => setCopied(false), 1500)
      }
      const saveCredential = async password => {
        setBusy('credential'); setError(''); setNotice('')
        try {
          await call('saveManagementCredential', { password })
          setNotice(t('dashboard.passwordSaved')); await refresh(true)
          return true
        } catch (cause) { setError(cause.message); return false }
        finally { setBusy('') }
      }
      const openOfficial = () => {
        try {
          const url = new URL(snapshot?.managementUrl)
          if (['http:', 'https:'].includes(url.protocol)) window.open(url.href, '_blank', 'noopener,noreferrer')
        } catch { setError(t('error.generic')) }
      }

      const service = snapshot?.processes?.service || { status: 'stopped', log: '' }
      const serviceActive = ['starting', 'running', 'stopping'].includes(service.status)
      const server = snapshot?.config?.server
      const healthStatus = snapshot?.health?.status || 'unknown'
      const dashboard = snapshot?.dashboard
      const traffic = dashboard?.traffic
      const verdict = healthStatus !== 'reachable' ? 'offline' : !traffic?.total ? 'idle'
        : traffic.successRate >= 95 ? 'good' : traffic.successRate >= 80 ? 'warning' : 'critical'

      const header = h('header', { className: 'cpa-header' }, [
        h('div', { key: 'brand', className: 'cpa-brand' }, [
          h(BrandMark, { key: 'mark', size: 28 }),
          h('div', { key: 'copy' }, [
            h('h1', { key: 'title' }, t('meta.title')),
            h('p', { key: 'subtitle' }, t('meta.subtitle'), ' -- ',
              h('a', { href: 'https://github.com/liuming-dev/dsh-plugins/tree/main/cliproxyapi-plus', target: '_blank', rel: 'noopener noreferrer' }, t('meta.source')),
              ', ', t('meta.thanks'), ' ',
              h('a', { href: 'https://github.com/kaitranntt/CLIProxyAPIPlus', target: '_blank', rel: 'noopener noreferrer' }, 'CLIProxyAPIPlus')),
          ]),
        ]),
        h(Status, { key: 'health', value: healthStatus }),
      ])
      const nav = h('nav', { className: 'cpa-nav', 'aria-label': t('meta.title') }, ['overview', 'authFiles', 'configuration', 'activity'].map(id =>
        h('button', { key: id, type: 'button', className: tab === id ? 'is-active' : '', onClick: () => setTab(id), 'aria-current': tab === id ? 'page' : undefined },
          h(Icon, { name: id === 'overview' ? 'terminal' : id === 'authFiles' ? 'key' : id === 'configuration' ? 'gear' : 'file', size: 15 }), t(`nav.${id}`))))

      const overview = h('div', { className: 'cpa-view cpa-overview' }, [
        ['needs-key', 'error'].includes(dashboard?.status) ? h(CredentialGate, { key: 'gate', busy: busy === 'credential', onSave: saveCredential }) : null,
        h('section', { key: 'service', className: 'cpa-service-strip' }, [
          h('div', { key: 'identity', className: 'cpa-service-strip__identity' }, [
            h('div', { key: 'status', className: 'cpa-service-strip__status' },
              h('h2', null, t('overview.service')), h(Status, { value: serviceActive ? service.status : healthStatus === 'reachable' ? 'reachable' : service.status })),
            h('button', { key: 'endpoint', type: 'button', className: 'cpa-endpoint', onClick: copyEndpoint, title: t('action.copy') },
              server?.baseUrl || '—', h(Icon, { name: copied ? 'check' : 'copy', size: 13 })),
            h('span', { key: 'source', className: 'cpa-muted' }, serviceActive ? t('label.process') : t('label.external')),
          ]),
          h('div', { key: 'buttons', className: 'cpa-button-row' }, [
            h(Button, { key: 'server', icon: serviceActive ? 'stop' : 'play', primary: !serviceActive,
              disabled: Boolean(busy) || service.status === 'stopping'
                || (!serviceActive && (healthStatus === 'reachable' || !configPath || !snapshot?.settings?.startCommand)),
              onClick: () => run(serviceActive ? 'stop' : 'start', serviceActive ? 'notice.stopped' : 'notice.started') },
              busy === 'start' ? t('status.starting') : t(serviceActive ? 'action.stop' : 'action.start')),
            h(Button, { key: 'official', icon: 'external', onClick: openOfficial, disabled: !snapshot?.managementUrl }, t('action.openOfficial')),
          ]),
        ]),
        h('div', { key: 'metrics', className: 'cpa-metrics' }, [
          h('section', { key: 'handled', className: 'cpa-metric cpa-request-total' }, [
            h('h2', { key: 'title' }, t('dashboard.handled')),
            h('strong', { key: 'value' }, dashboard?.status === 'ready' ? (traffic?.total || 0).toLocaleString() : '—'),
            h('p', { key: 'window' }, t('dashboard.window', { minutes: traffic?.windowMinutes || 200 })),
          ]),
          h('section', { key: 'success', className: 'cpa-metric' }, [
            h('h2', { key: 'title' }, t('dashboard.successRate')),
            h('strong', { key: 'value' }, percent(traffic?.successRate)),
            h('p', { key: 'count' }, `${t('dashboard.success')} ${(traffic?.totalSuccess || 0).toLocaleString()}`),
          ]),
          h('section', { key: 'failed', className: 'cpa-metric' }, [
            h('h2', { key: 'title' }, t('dashboard.failed')),
            h('strong', { key: 'value', className: traffic?.totalFailure ? 'cpa-danger' : '' }, dashboard?.status === 'ready' ? (traffic?.totalFailure || 0).toLocaleString() : '—'),
            h('p', { key: 'state' }, t(`dashboard.${verdict}`)),
          ]),
        ]),
        h(TrafficChart, { key: 'traffic', traffic }),
        h('div', { key: 'activity', className: 'cpa-overview-activity' }, [
          h('span', { key: 'meta', className: 'cpa-muted' }, `${t('overview.version')} ${server?.configVersion ? `v${server.configVersion}` : '—'} · TCP ${server?.port || '—'}`),
          h(Button, { key: 'logs', icon: 'file', onClick: () => setTab('activity') }, t('nav.activity')),
        ]),
      ])

      const configuration = h('div', { className: 'cpa-view cpa-configuration' }, [
        h('section', { key: 'settings', className: 'cpa-panel cpa-runtime-settings' }, [
          h('div', { key: 'head', className: 'cpa-panel__head' }, h('div', null, h('h2', null, t('settings.title')), h('p', null, t('settings.description'))),
            h('div', { className: 'cpa-settings-actions' },
              h('span', { className: `cpa-settings-feedback ${settingsFeedback ? `is-${settingsFeedback.kind}` : ''}`,
                role: settingsFeedback?.kind === 'error' ? 'alert' : 'status' },
              busy === 'settings' ? '' : settingsFeedback ? settingsFeedback.text : settingsDirty ? t('settings.dirty') : ''),
              h(Button, { icon: 'check', primary: true, disabled: !settingsDirty || Boolean(busy), onClick: saveSettings },
                t(busy === 'settings' ? 'settings.saving' : 'action.saveSettings')))),
          h('div', { key: 'fields', className: 'cpa-fields' }, [
            h(Field, { key: 'path', label: t('settings.configPath') }, h('input', { value: settings.configPath || '', placeholder: t('settings.configPathPlaceholder'), onChange: event => changeSetting('configPath', event.target.value), disabled: busy === 'settings', spellCheck: false })),
            h(Field, { key: 'start', label: t('settings.startCommand') }, h(CommandInput, { value: settings.startCommand || '', placeholder: t('settings.startCommandPlaceholder'), onChange: event => changeSetting('startCommand', event.target.value), disabled: busy === 'settings' })),
            h('fieldset', { key: 'auth', className: 'cpa-auth-clients' }, [
              h('legend', { key: 'label', className: 'cpa-field__label' }, t('settings.authClients')),
              h('div', { key: 'choices', className: 'cpa-client-choices' }, ['qoder', 'codex'].map(client => h('label', { key: client, className: settings.authClients?.includes(client) ? 'is-selected' : '' },
                h('input', { type: 'checkbox', checked: (settings.authClients || []).includes(client), disabled: busy === 'settings', onChange: event =>
                  changeSetting('authClients', event.target.checked ? [...(settings.authClients || []), client] : settings.authClients.filter(value => value !== client)) }),
                client === 'qoder' ? 'Qoder' : 'Codex'))),
              h('p', { key: 'hint', className: 'cpa-field__hint' }, t('settings.authClientsHint')),
              h(AuthenticationCommandPreview, { key: 'preview', settings, dirty: settingsDirty,
                clients: settings.configPath.trim() === configPath ? snapshot?.auth?.clients : [] }),
            ]),
            h(Field, { key: 'url', label: t('settings.managementUrl'), hint: t('settings.managementHint') }, h('input', { value: settings.managementUrl || '', onChange: event => changeSetting('managementUrl', event.target.value), placeholder: 'http://127.0.0.1:8317/management.html', disabled: busy === 'settings', spellCheck: false })),
          ]),
        ]),
        h('section', { key: 'editor', className: 'cpa-panel cpa-editor-panel' }, [
          h('div', { key: 'head', className: 'cpa-panel__head cpa-editor-panel__head' }, [
            h('div', { key: 'title' }, h('h2', null, t('editor.title')), h('p', null, t('editor.description')), h('code', { className: 'cpa-path' }, document?.path || snapshot?.config?.path || settings.configPath)),
            h('div', { key: 'actions', className: 'cpa-button-row' }, [
              h(Button, { key: 'reload', icon: 'refresh', onClick: reloadYaml, disabled: Boolean(busy) || !configPath }, t('action.reload')),
              h(Button, { key: 'validate', icon: 'check', onClick: validateYaml, disabled: !document || Boolean(busy) }, t('action.validate')),
              h(Button, { key: 'save', icon: 'file', primary: true, onClick: () => saveYaml(), disabled: !document || !dirty || Boolean(busy) }, t('action.saveYaml')),
            ]),
          ]),
          h('div', { key: 'state', className: 'cpa-editor-state' },
            h(Status, { value: dirty ? 'attention' : 'reachable', label: t(dirty ? 'editor.dirty' : 'editor.clean') }),
            validation?.ok ? h('span', { className: 'cpa-valid' }, h(Icon, { name: 'check', size: 13 }), t('editor.valid')) : null),
          conflict ? h('div', { key: 'conflict', className: 'cpa-conflict', role: 'alert' }, h('span', null, t('editor.conflict')),
            h(Button, { icon: 'alert', danger: true, onClick: () => saveYaml(true), disabled: Boolean(busy) }, t('action.overwrite'))) : null,
          document ? h(YamlEditor, { key: 'yaml', value: yaml, onChange: changeYaml, onSave: () => dirty && !busy && saveYaml(), label: t('editor.title') })
            : h('div', { key: 'loading', className: 'cpa-editor-loading' }, !configPath ? t('editor.configurePath') : snapshot?.config?.message || t('label.loading')),
        ]),
      ])

      const authFiles = h(AuthFilesView, {
        dashboard, localAuth: snapshot?.auth, busy: Boolean(busy), authentication, authActive,
        authenticationConfigured: Boolean(configPath && snapshot?.settings?.startCommand && snapshot?.settings?.authClients?.length), onSaveCredential: saveCredential,
        onAuthenticate: () => run('authenticate', 'notice.authStarted'),
        onStopAuthentication: () => run('stopAuthentication', 'notice.authStopped'),
      })

      const activity = h('div', { className: 'cpa-view cpa-activity' }, [
        h('div', { key: 'service', className: 'cpa-activity__meta' }, h(Status, { value: service.status }), h('code', null, service.command || '—')),
        h(LogBlock, { key: 'service-log', title: t('activity.service'), log: service.log }),
        h('div', { key: 'auth', className: 'cpa-activity__meta' }, h(Status, { value: authentication.status }), h('code', null, authentication.command || '—')),
        h(LogBlock, { key: 'auth-log', title: t('activity.authentication'), log: authentication.log }),
      ])

      return h('main', { className: 'cpa-root', 'data-cliproxyapi-plus': '' }, [
        h('style', { key: 'style' }, CSS),
        React.cloneElement(header, { key: 'header' }), React.cloneElement(nav, { key: 'nav' }),
        error ? h('div', { key: 'error', className: 'cpa-notice cpa-notice--error', role: 'alert' }, h(Icon, { name: 'alert' }), h('span', null, error)) : null,
        notice ? h('div', { key: 'notice', className: 'cpa-notice cpa-notice--success', role: 'status' }, h(Icon, { name: 'check' }), h('span', null, notice)) : null,
        loading && !snapshot ? h('div', { key: 'loading', className: 'cpa-loading' }, h('span', { className: 'cpa-loader' }), t('label.loading'))
          : h('div', { key: 'content', className: 'cpa-content' }, tab === 'overview' ? overview : tab === 'authFiles' ? authFiles : tab === 'configuration' ? configuration : activity),
        h('footer', { key: 'footer', className: 'cpa-footer' }, h('span', null, t('overview.localData')),
          h('span', null, `${t('label.lastRefresh')}: ${snapshot?.generatedAt ? formatTime(snapshot.generatedAt) : '—'}`)),
      ])
    }

    const CSS = `
      .cpa-root {
        --cpa-accent: var(--dsw-alias-brand-primary-new-colorprimary-new-color, #4176e6);
        --cpa-code: var(--ds-font-family-code, ui-monospace, monospace);
        box-sizing: border-box;
        height: 100%; min-height: 0; overflow: auto;
        padding: 26px clamp(18px, 3vw, 44px) 20px;
        background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary);
        font-family: var(--dsw-font-family, inherit); font-size: 13px; line-height: 1.6;
      }
      .cpa-root *, .cpa-dialog * { box-sizing: border-box; }
      .cpa-root button, .cpa-root input, .cpa-root textarea, .cpa-root select { font: inherit; }
      .cpa-root h1, .cpa-root h2, .cpa-root h3, .cpa-root p { margin: 0; }
      .cpa-root h1 { font-size: 20px; font-weight: 600; letter-spacing: -.025em; line-height: 1.4; }
      .cpa-root h2, .cpa-root h3, .cpa-dialog h2 { font-size: 14px; font-weight: 600; line-height: 1.5; letter-spacing: 0; }
      .cpa-root code { font-family: var(--cpa-code); }
      .cpa-root a { color: var(--cpa-accent); text-underline-offset: 3px; }
      .cpa-header, .cpa-nav, .cpa-content, .cpa-footer, .cpa-notice { max-width: 1200px; margin-left: auto; margin-right: auto; }
      .cpa-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 20px; margin-bottom: 24px; }
      .cpa-brand { display: flex; align-items: flex-start; gap: 11px; min-width: 0; }
      .cpa-brand > svg { flex: none; margin-top: 2px; }
      .cpa-brand p { margin-top: 3px; color: var(--dsw-alias-label-secondary); font-size: 12px; overflow-wrap: anywhere; }
      .cpa-brand p a { color: inherit; text-decoration: none; }
      .cpa-brand p a:hover { color: var(--cpa-accent); text-decoration: underline; }
      .cpa-header > .cpa-status { margin-top: 8px; }
      .cpa-button-row { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
      .cpa-button {
        display: inline-flex; align-items: center; justify-content: center; gap: 6px;
        min-height: 32px; padding: 5px 11px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 8px;
        background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary);
        font-size: 12px !important; font-weight: 500; line-height: 1.4; cursor: pointer;
        transition: background-color .15s, border-color .15s;
      }
      .cpa-button:hover:not(:disabled) { background: var(--dsw-alias-bg-layer-2); }
      .cpa-button--primary { background: var(--dsw-alias-label-primary); color: var(--dsw-alias-bg-base); border-color: transparent; }
      .cpa-button--primary:hover:not(:disabled) { background: var(--dsw-alias-label-primary); opacity: .86; }
      .cpa-button--danger { color: var(--dsw-alias-state-error-primary); }
      .cpa-button:disabled { opacity: .45; cursor: not-allowed; }
      .cpa-root :is(button, input, textarea, select, a, summary, pre):focus-visible { outline: 2px solid var(--cpa-accent); outline-offset: 3px; }
      .cpa-status { display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; color: var(--dsw-alias-label-secondary); font-size: 11px; }
      .cpa-status i { width: 6px; height: 6px; border-radius: 50%; background: var(--dsw-alias-state-idle-primary); }
      .cpa-status--running i, .cpa-status--reachable i, .cpa-status--authenticated i { background: var(--dsw-alias-state-success-primary); }
      .cpa-status--failed i, .cpa-status--error i, .cpa-status--expired i, .cpa-status--invalid i { background: var(--dsw-alias-state-error-primary); }
      .cpa-status--starting i, .cpa-status--stopping i, .cpa-status--attention i { background: var(--dsw-alias-state-warn-primary); }
      .cpa-nav { display: flex; gap: 25px; margin-bottom: 24px; border-bottom: 1px solid var(--dsw-alias-border-l1); }
      .cpa-nav button { display: flex; align-items: center; gap: 7px; padding: 0 1px 12px; margin-bottom: -1px; border: 0; border-bottom: 2px solid transparent; background: none; color: var(--dsw-alias-label-secondary); font-size: 13px; cursor: pointer; }
      .cpa-nav button.is-active { color: var(--dsw-alias-label-primary); border-bottom-color: var(--dsw-alias-label-primary); font-weight: 500; }
      .cpa-view { display: flex; flex-direction: column; gap: 20px; }
      .cpa-muted { color: var(--dsw-alias-label-secondary); font-size: 11px; }
      .cpa-success { color: var(--dsw-alias-state-success-primary); }
      .cpa-danger, .cpa-inline-error { color: var(--dsw-alias-state-error-primary); }
      .cpa-inline-error { margin-top: 10px !important; font-size: 12px; overflow-wrap: anywhere; }
      .cpa-service-strip { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 15px 18px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 10px; }
      .cpa-service-strip__identity { display: flex; align-items: center; flex-wrap: wrap; gap: 8px 18px; min-width: 0; }
      .cpa-service-strip__status { display: flex; align-items: center; gap: 10px; }
      .cpa-service-strip h2 { font-size: 13px; }
      .cpa-endpoint { display: inline-flex; align-items: center; gap: 7px; padding: 0; border: 0; background: none; color: var(--dsw-alias-label-secondary); font: 12px var(--cpa-code) !important; cursor: pointer; }
      .cpa-endpoint svg { flex: none; }
      .cpa-metrics { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); border: 1px solid var(--dsw-alias-border-l1); border-radius: 10px; }
      .cpa-metric { padding: 19px 22px; min-width: 0; }
      .cpa-metric + .cpa-metric { border-left: 1px solid var(--dsw-alias-border-l1); }
      .cpa-metric h2 { color: var(--dsw-alias-label-secondary); font-size: 12px; font-weight: 400; }
      .cpa-metric > strong { display: block; margin: 7px 0 5px; font-size: 30px; font-weight: 500; line-height: 1.3; letter-spacing: -.025em; font-variant-numeric: tabular-nums; }
      .cpa-metric p { font-size: 11px; color: var(--dsw-alias-label-secondary); }
      .cpa-traffic, .cpa-panel { border: 1px solid var(--dsw-alias-border-l1); border-radius: 10px; background: var(--dsw-alias-bg-base); }
      .cpa-panel__head { display: flex; align-items: flex-start; justify-content: space-between; gap: 18px; padding: 18px 20px; border-bottom: 1px solid var(--dsw-alias-border-l1); }
      .cpa-panel__head p, .cpa-view-heading p { margin-top: 4px; color: var(--dsw-alias-label-secondary); font-size: 12px; max-width: 760px; }
      .cpa-segmented { display: inline-flex; flex: none; gap: 2px; padding: 3px; border-radius: 7px; background: var(--dsw-alias-bg-layer-1); }
      .cpa-segmented button { border: 0; border-radius: 5px; padding: 4px 9px; background: transparent; color: var(--dsw-alias-label-secondary); font-size: 11px; cursor: pointer; }
      .cpa-segmented button[aria-pressed=true] { color: var(--dsw-alias-label-primary); background: var(--dsw-alias-bg-base); box-shadow: 0 1px 3px rgb(0 0 0 / 7%); }
      .cpa-traffic-summary { display: flex; align-items: center; flex-wrap: wrap; gap: 10px 24px; padding: 17px 20px 0; }
      .cpa-traffic-summary > span { color: var(--dsw-alias-label-secondary); font-size: 11px; }
      .cpa-traffic-summary strong { margin-left: 9px; color: var(--dsw-alias-label-primary); font-size: 13px; font-weight: 500; font-variant-numeric: tabular-nums; }
      .cpa-chart-legend { display: flex; gap: 14px; margin-left: auto; color: var(--dsw-alias-label-secondary); font-size: 11px; }
      .cpa-chart-legend span::before { content: ''; display: inline-block; width: 7px; height: 7px; margin-right: 5px; border-radius: 2px; background: var(--cpa-accent); }
      .cpa-chart-legend .is-failed::before { background: var(--dsw-alias-state-error-primary); }
      .cpa-traffic__chart { padding: 0 20px 15px 12px; }
      .cpa-chart-tooltip { min-height: 28px; padding-top: 8px; text-align: right; color: var(--dsw-alias-label-secondary); font-size: 11px; }
      .cpa-traffic__chart svg { display: block; width: 100%; height: auto; min-height: 150px; }
      .cpa-chart-grid line { stroke: var(--dsw-alias-border-l1); stroke-dasharray: 3 4; }
      .cpa-chart-grid text, .cpa-chart-axis { fill: var(--dsw-alias-label-secondary); font: 10px var(--cpa-code); }
      .cpa-chart-hit { fill: transparent; }
      .cpa-traffic__bucket .is-success { fill: var(--cpa-accent); opacity: .7; }
      .cpa-traffic__bucket .is-failed { fill: var(--dsw-alias-state-error-primary); }
      .cpa-traffic__bucket:hover .is-success, .cpa-traffic__bucket:focus .is-success { opacity: 1; }
      .cpa-traffic__bucket:focus { outline: none; }
      .cpa-traffic__bucket:focus .cpa-chart-hit { fill: color-mix(in srgb, var(--cpa-accent) 10%, transparent); }
      .cpa-traffic__table { margin: 0 20px; padding: 12px 0; border-top: 1px solid var(--dsw-alias-border-l1); }
      .cpa-traffic__table summary, .cpa-request-records summary { width: fit-content; cursor: pointer; color: var(--dsw-alias-label-secondary); font-size: 11px; }
      .cpa-data-table { width: 100%; border-collapse: collapse; font-size: 12px; font-variant-numeric: tabular-nums; }
      .cpa-data-table th, .cpa-data-table td { padding: 8px 10px; border-bottom: 1px solid var(--dsw-alias-border-l1); text-align: right; }
      .cpa-data-table th { color: var(--dsw-alias-label-secondary); font-size: 11px; font-weight: 400; }
      .cpa-data-table th:first-child, .cpa-data-table td:first-child { text-align: left; }
      .cpa-overview-activity { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
      .cpa-view-heading { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
      .cpa-auth-tools { display: flex; flex-direction: column; gap: 14px; }
      .cpa-provider-filter { display: flex; flex-wrap: wrap; gap: 6px; }
      .cpa-provider-filter button { display: flex; align-items: center; gap: 8px; padding: 5px 10px; border: 1px solid transparent; border-radius: 7px; color: var(--dsw-alias-label-secondary); background: none; font-size: 12px; cursor: pointer; text-transform: capitalize; }
      .cpa-provider-filter button[aria-pressed=true] { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); }
      .cpa-provider-filter button span { min-width: 18px; padding: 0 4px; border-radius: 4px; background: var(--dsw-alias-bg-layer-1); font-size: 10px; }
      .cpa-auth-search { display: flex; gap: 10px; }
      .cpa-root input:not([type="checkbox"]), .cpa-root select { min-height: 34px; }
      .cpa-auth-search input, .cpa-model-tools input, .cpa-auth-search select, .cpa-credential-gate input { min-width: 0; padding: 7px 11px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 8px; background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); font-size: 12px; }
      .cpa-auth-search input { flex: 1; }
      .cpa-auth-search select { flex: none; min-width: 110px; }
      .cpa-auth-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; align-items: start; }
      .cpa-auth-card { min-width: 0; padding: 19px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 10px; }
      .cpa-auth-card--disabled { opacity: .65; }
      .cpa-auth-card__head { display: flex; align-items: center; gap: 9px; }
      .cpa-auth-card__head > strong { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; font-weight: 500; }
      .cpa-provider-badge { flex: none; padding: 2px 7px; border-radius: 5px; background: color-mix(in srgb, var(--cpa-accent) 9%, transparent); color: var(--cpa-accent); font-size: 11px; font-weight: 500; text-transform: capitalize; }
      .cpa-auth-state { display: flex; align-items: center; gap: 5px; font-size: 10px; color: var(--dsw-alias-label-secondary); white-space: nowrap; }
      .cpa-auth-state::before { content: ''; width: 5px; height: 5px; border-radius: 50%; background: currentColor; }
      .cpa-auth-state--active { color: var(--dsw-alias-state-success-primary); }
      .cpa-auth-state--unavailable { color: var(--dsw-alias-state-error-primary); }
      .cpa-credential-filename { display: block; margin-top: 6px; color: var(--dsw-alias-label-secondary); font-size: 11px; overflow-wrap: anywhere; }
      .cpa-auth-card__requests { margin-top: 20px; }
      .cpa-request-counts { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; font-size: 11px; font-variant-numeric: tabular-nums; }
      .cpa-request-counts > span:first-child { margin-right: auto; color: var(--dsw-alias-label-secondary); }
      .cpa-request-counts > strong { font-size: 11px; font-weight: 500; }
      .cpa-mini-requests { display: flex; gap: 3px; height: 13px; margin-top: 8px; }
      .cpa-mini-requests i { flex: 1; min-width: 2px; border-radius: 2px; background: var(--dsw-alias-border-l2); }
      .cpa-mini-requests i.is-success { background: var(--dsw-alias-state-success-primary); }
      .cpa-mini-requests i.is-failed { background: var(--dsw-alias-state-error-primary); }
      .cpa-mini-requests i.is-mixed { background: var(--dsw-alias-state-warn-primary); }
      .cpa-request-records { margin-top: 8px; max-height: 240px; overflow: auto; }
      .cpa-request-records p { margin: 8px 0 3px; color: var(--dsw-alias-label-secondary); font-size: 10px; }
      .cpa-request-records .cpa-data-table { font-size: 11px; }
      .cpa-quota { margin-top: 16px; padding: 12px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px; background: var(--dsw-alias-bg-layer-1); }
      .cpa-quota__head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 9px; }
      .cpa-quota__head > strong { font-size: 12px; font-weight: 500; }
      .cpa-quota__head .cpa-button { min-height: 26px; padding: 3px 8px; font-size: 11px !important; }
      .cpa-quota-bucket { padding: 5px 0 11px; }
      .cpa-quota-bucket + .cpa-quota-bucket { padding-top: 14px; border-top: 1px solid var(--dsw-alias-border-l1); }
      .cpa-quota-bucket__head { display: flex; align-items: center; flex-wrap: wrap; gap: 6px 8px; margin-bottom: 9px; }
      .cpa-quota-bucket__head > strong { font-size: 12px; font-weight: 500; }
      .cpa-quota-reset { margin-left: auto; color: var(--dsw-alias-label-secondary); font-size: 10px; }
      .cpa-plan-badge { padding: 1px 6px; border-radius: 4px; background: color-mix(in srgb, var(--dsw-alias-state-success-primary) 9%, transparent); color: var(--dsw-alias-state-success-primary); font-size: 10px; }
      .cpa-quota-meter { height: 10px; overflow: hidden; border-radius: 1px; background: var(--dsw-alias-border-l1); mask-image: repeating-linear-gradient(90deg, #000 0, #000 4px, transparent 4px, transparent 7px); }
      .cpa-quota-meter > span { display: block; height: 100%; background: var(--dsw-alias-label-secondary); transition: width .2s ease; }
      .cpa-quota-bucket__numbers { display: flex; align-items: baseline; flex-wrap: wrap; justify-content: space-between; gap: 6px 14px; margin-top: 8px; font-size: 11px; font-variant-numeric: tabular-nums; }
      .cpa-quota-fraction { color: var(--dsw-alias-label-secondary); }
      .cpa-quota-fraction > strong { color: var(--dsw-alias-label-primary); font-size: 12px; font-weight: 500; }
      .cpa-quota-remaining { margin-left: auto; color: var(--dsw-alias-label-secondary); font-size: 11px; }
      .cpa-quota-remaining > strong { margin-left: 7px; color: var(--dsw-alias-label-primary); font-size: 14px; font-weight: 600; }
      .cpa-quota-partial, .cpa-quota__source { margin-top: 7px !important; color: var(--dsw-alias-label-secondary); font-size: 10px; }
      .cpa-quota__source { padding-top: 9px; border-top: 1px solid var(--dsw-alias-border-l1); }
      .cpa-codex-summary { display: flex; flex-wrap: wrap; gap: 7px; margin-bottom: 12px; font-size: 11px; color: var(--dsw-alias-label-secondary); }
      .cpa-codex-summary > span { padding: 4px 8px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 6px; }
      .cpa-codex-summary strong { color: var(--dsw-alias-label-primary); font-weight: 500; font-variant-numeric: tabular-nums; }
      .cpa-codex-window { padding: 12px 0; border-top: 1px solid var(--dsw-alias-border-l1); }
      .cpa-codex-window .cpa-quota-meter { margin-top: 8px; }
      .cpa-codex-resets { margin-bottom: 12px; color: var(--dsw-alias-label-secondary); font-size: 11px; }
      .cpa-codex-resets summary { cursor: pointer; }
      .cpa-codex-resets ul { list-style: none; padding: 8px 0 0; margin: 0; }
      .cpa-codex-resets li { display: flex; justify-content: space-between; gap: 12px; padding: 3px 0; font-variant-numeric: tabular-nums; }
      .cpa-auth-flow { overflow: hidden; border: 1px solid var(--dsw-alias-border-l2); border-radius: 10px; }
      .cpa-auth-flow__head { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 13px 16px 0; }
      .cpa-auth-flow__head > div { display: flex; align-items: center; flex-wrap: wrap; gap: 12px; }
      .cpa-auth-flow__head h3 { font-size: 13px; }
      .cpa-auth-flow__hint { padding: 6px 16px 12px; color: var(--dsw-alias-label-secondary); font-size: 12px; }
      .cpa-auth-flow .cpa-log { border: 0; border-top: 1px solid var(--dsw-alias-border-l1); border-radius: 0; }
      .cpa-auth-flow .cpa-log__head { display: none; }
      .cpa-auth-flow .cpa-log__body { min-height: 60px; max-height: 190px; }
      .cpa-auth-card__footer { display: flex; align-items: center; flex-wrap: wrap; justify-content: space-between; gap: 10px; margin-top: 16px; padding-top: 13px; border-top: 1px solid var(--dsw-alias-border-l1); }
      .cpa-auth-card__footer .cpa-button { min-height: 29px; padding: 4px 9px; font-size: 11px !important; }
      .cpa-auth-card__footer > span { font-size: 10px; }
      .cpa-dialog { width: min(760px, calc(100vw - 36px)); max-height: calc(100vh - 64px); padding: 0; border: 1px solid var(--dsw-alias-border-l2); border-radius: 12px; background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); font-family: var(--dsw-font-family, inherit); box-shadow: 0 18px 70px rgb(0 0 0 / 18%); }
      .cpa-dialog::backdrop { background: rgb(0 0 0 / 30%); }
      .cpa-dialog .cpa-panel__head { align-items: center; }
      .cpa-dialog .cpa-panel__head > div { min-width: 0; }
      .cpa-dialog .cpa-panel__head p { overflow-wrap: anywhere; }
      .cpa-dialog__body { max-height: calc(100vh - 210px); overflow: auto; overscroll-behavior: contain; padding: 16px 20px 20px; }
      .cpa-model-tools { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
      .cpa-model-tools input { flex: 1; min-width: 0; }
      .cpa-model-tools span { white-space: nowrap; }
      .cpa-model-table :is(td, th) { text-align: left; overflow-wrap: anywhere; }
      .cpa-model-table code { font-size: 11px; }
      .cpa-detail-note { margin-bottom: 12px !important; font-size: 11px; color: var(--dsw-alias-label-secondary); }
      .cpa-file-details { margin: 0; padding: 14px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px; background: var(--dsw-alias-bg-layer-1); white-space: pre-wrap; overflow-wrap: anywhere; font: 12px/1.75 var(--cpa-code); }
      .cpa-fields { display: grid; grid-template-columns: minmax(0, 1fr); gap: 22px; padding: 20px; }
      .cpa-field { display: flex; flex-direction: column; min-width: 0; gap: 6px; }
      .cpa-runtime-settings .cpa-panel__head > div:first-child { min-width: 0; flex: 1 1 360px; }
      .cpa-settings-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; align-items: center; gap: 8px 12px; margin-left: auto; }
      .cpa-settings-feedback { max-width: 300px; font-size: 11px; color: var(--dsw-alias-label-secondary); overflow-wrap: anywhere; }
      .cpa-settings-feedback:empty { display: none; }
      .cpa-settings-feedback.is-success { color: var(--dsw-alias-state-success-primary); }
      .cpa-settings-feedback.is-error { color: var(--dsw-alias-state-error-primary); }
      .cpa-auth-clients { min-width: 0; margin: 0; padding: 0; border: 0; }
      .cpa-auth-clients legend { padding: 0; margin-bottom: 8px; }
      .cpa-client-choices { display: flex; flex-wrap: wrap; gap: 6px 12px; margin: 0 0 8px -8px; }
      .cpa-client-choices label { display: inline-flex; align-items: center; gap: 7px; padding: 4px 8px; border-radius: 5px; font-size: 12px; cursor: pointer; }
      .cpa-client-choices label:hover { background: var(--dsw-alias-bg-layer-2); }
      .cpa-client-choices label.is-selected { background: color-mix(in srgb, var(--cpa-accent) 8%, transparent); }
      .cpa-client-choices label:focus-within { outline: 2px solid var(--cpa-accent); outline-offset: 2px; }
      .cpa-client-choices input { width: 14px; height: 14px; margin: 0; accent-color: var(--cpa-accent); }
      .cpa-command-preview { min-width: 0; margin-top: 10px; font-size: 11px; color: var(--dsw-alias-label-secondary); }
      .cpa-command-preview summary { width: fit-content; cursor: pointer; padding: 2px 0; }
      .cpa-command-preview p { margin-top: 9px; }
      .cpa-command-preview__list { display: grid; gap: 12px; margin-top: 10px; padding: 12px 14px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 7px; background: var(--dsw-alias-bg-layer-1); }
      .cpa-command-preview__item { min-width: 0; }
      .cpa-command-preview__head { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; margin-bottom: 4px; }
      .cpa-command-preview__head strong { color: var(--dsw-alias-label-primary); font-weight: 500; }
      .cpa-command-preview code { display: block; color: var(--dsw-alias-label-primary); white-space: pre-wrap; overflow-wrap: anywhere; font: 11px/1.7 var(--cpa-code); }
      .cpa-field__label { font-size: 12px; font-weight: 500; }
      .cpa-field__hint { font-size: 11px; color: var(--dsw-alias-label-secondary); }
      .cpa-field input, .cpa-field textarea { width: 100%; padding: 8px 10px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 7px; color: var(--dsw-alias-label-primary); background: var(--dsw-alias-bg-base); font: 12px/1.6 var(--cpa-code); resize: vertical; }
      .cpa-field .cpa-start-command { min-height: 34px; max-height: 320px; resize: none; overflow-y: auto; }
      .cpa-path { display: block; margin-top: 8px; color: var(--dsw-alias-label-secondary); font-size: 11px; overflow-wrap: anywhere; }
      .cpa-editor-panel__head { align-items: center; }
      .cpa-editor-state { display: flex; align-items: center; gap: 16px; padding: 9px 16px; border-bottom: 1px solid var(--dsw-alias-border-l1); }
      .cpa-valid { display: inline-flex; align-items: center; gap: 5px; font-size: 11px; color: var(--dsw-alias-state-success-primary); }
      .cpa-conflict { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 12px 16px; color: var(--dsw-alias-state-warn-primary); font-size: 12px; }
      .cpa-editor { position: relative; height: min(520px, 58vh); min-height: 340px; overflow: hidden; border-radius: 0 0 10px 10px; background: var(--dsw-alias-bg-base); }
      .cpa-editor__codemirror, .cpa-editor__codemirror > .cm-editor { height: 100%; min-height: 0; }
      .cpa-editor__native { position: absolute; inset: 0; width: 100%; height: 100%; padding: 15px 17px; border: 0; border-radius: 0; resize: none; white-space: pre; overflow: auto; background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); }
      .cpa-root .cpa-editor__native { font: 12px/1.65 var(--cpa-code); letter-spacing: 0; tab-size: 2; }
      .cpa-editor-loading { display: grid; place-items: center; min-height: 340px; color: var(--dsw-alias-label-secondary); }
      .cpa-log { overflow: hidden; border: 1px solid var(--dsw-alias-border-l1); border-radius: 10px; }
      .cpa-log__head { display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; border-bottom: 1px solid var(--dsw-alias-border-l1); font-size: 12px; }
      .cpa-log__head span { display: flex; align-items: center; gap: 7px; }
      .cpa-log__body { margin: 0; padding: 14px 16px; min-height: 100px; max-height: 42vh; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; color: var(--dsw-alias-label-secondary); font: 11px/1.8 var(--cpa-code); }
      .cpa-activity__meta { display: flex; align-items: center; gap: 14px; }
      .cpa-activity__meta code { min-width: 0; overflow-wrap: anywhere; color: var(--dsw-alias-label-secondary); font-size: 11px; }
      .cpa-credential-gate { display: flex; flex-wrap: wrap; align-items: end; gap: 14px; padding: 16px 18px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 10px; }
      .cpa-credential-gate__copy { flex: 1 1 300px; }
      .cpa-credential-gate__copy h3 { font-size: 13px; }
      .cpa-credential-gate__copy p { margin-top: 4px; color: var(--dsw-alias-label-secondary); font-size: 11px; }
      .cpa-credential-gate__field { display: flex; flex-direction: column; gap: 5px; }
      .cpa-empty, .cpa-loading { padding: 35px 20px; text-align: center; color: var(--dsw-alias-label-secondary); font-size: 12px; }
      .cpa-empty p { margin-bottom: 12px; }
      .cpa-loading { min-height: 220px; }
      .cpa-notice { display: flex; gap: 8px; align-items: center; margin-bottom: 16px; padding: 10px 13px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px; font-size: 12px; }
      .cpa-notice--error { color: var(--dsw-alias-state-error-primary); }
      .cpa-notice--success { color: var(--dsw-alias-state-success-primary); }
      .cpa-footer { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 10px; padding-top: 16px; margin-top: 24px; color: var(--dsw-alias-label-secondary); font-size: 10px; }
      @media (max-width: 1100px) {
        .cpa-auth-grid { grid-template-columns: 1fr; }
        .cpa-service-strip { align-items: flex-start; }
        .cpa-service-strip__identity { align-items: flex-start; flex-direction: column; gap: 5px; }
      }
      @media (max-width: 760px) {
        .cpa-header { flex-wrap: wrap; gap: 8px; }
        .cpa-header > .cpa-status { margin-left: 39px; margin-top: 0; }
        .cpa-metric { padding: 15px 14px; }
        .cpa-metric > strong { font-size: 25px; }
        .cpa-panel__head { flex-wrap: wrap; gap: 12px; padding: 16px; }
        .cpa-traffic-summary { padding: 14px 16px 0; gap: 8px 18px; }
        .cpa-fields { grid-template-columns: 1fr; padding: 16px; }
        .cpa-view-heading { align-items: flex-start; }
        .cpa-nav { gap: 20px; }
      }
      @media (max-width: 480px) {
        .cpa-root { padding: 18px 14px; }
        .cpa-service-strip { flex-direction: column; }
        .cpa-metrics { grid-template-columns: 1fr; }
        .cpa-metric { display: grid; grid-template-columns: 1fr auto; gap: 4px 14px; }
        .cpa-metric > strong { grid-column: 2; grid-row: 1 / 3; align-self: center; margin: 0; }
        .cpa-metric + .cpa-metric { border-left: 0; border-top: 1px solid var(--dsw-alias-border-l1); }
        .cpa-auth-card { padding: 15px; }
        .cpa-auth-card__head { flex-wrap: wrap; }
        .cpa-chart-legend { margin-left: 0; }
        .cpa-nav { justify-content: space-between; gap: 8px; }
        .cpa-nav button { gap: 4px; font-size: 12px; }
      }
      @media (prefers-reduced-motion: reduce) { .cpa-root * { transition: none !important; } }
    `

    return {
      inject: ['slots', 'locale', 'remote'],
      apply(ctx) {
        translate = ctx.locale.bind(NS)
        ctx.effect(() => {
          const zh = ctx.locale.register(NS, 'zh', ZH)
          const en = ctx.locale.register(NS, 'en', EN)
          return () => { zh(); en() }
        }, 'CLIProxyAPI Plus locale')
        ctx.effect(() => {
          let disposed = false
          remoteReady = ctx.remote.$mount(CLIENT_REMOTE).then(unmount => {
            if (disposed) { unmount?.(); return }
            remoteClient = ctx.get('remote.cliproxyapiPlus')
            return unmount
          }).catch(error => { console.error('[cliproxyapi-plus] RPC mount failed', error); throw error })
          return async () => { disposed = true; remoteClient = undefined; const unmount = await remoteReady.catch(() => undefined); await unmount?.() }
        }, 'CLIProxyAPI Plus RPC')
        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
          name: 'sidebar.panellist', id: PANEL_ID, order: 8, locale: NS, label: () => t('meta.title'),
        }, ({ size = 20 }) => h(BrandMark, { size })))
        ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: PANEL_ID, locale: NS }, App))
      },
    }
  },
})
