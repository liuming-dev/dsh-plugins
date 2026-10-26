# dsh-annotation-rewind-scroll

**注释、消息编辑和滚动** · Annotations, message editing and scrolling

支持四项能力：

- 为回复和文档添加注释，随下一条消息发送。
- 编辑历史用户消息，从该条重新生成并执行。
- 在聊天区使用 **↑/↓、Page Up/Page Down** 滚动浏览用户消息。
- 在输入框使用相同按键调出历史用户输入，供修改后发送。

## 安装与本地调试

在 Harness 的插件管理页安装 `dsh-annotation-rewind-scroll` 并启用。npm 包发布后也可运行：

```bash
dsh plugin --profile web add dsh-annotation-rewind-scroll
```

本地开发安装：在插件管理页选择本地路径，填写本目录的绝对路径；移动目录后，先移除旧安装项，再安装新目录。注释数据与历史编辑记录使用稳定标识，不随安装路径改变。

本机当前开发命令：

```bash
cd ~/My/codespace/github/my-dsh-plugins/annotation-rewind-scroll
npm test
npm run pack:check
```

`npm test` 复用本机的 Harness 源码、已安装运行时和浏览器测试依赖；发布包不携带这些测试或本机路径。公共 npm 发布说明见 [RELEASING.md](RELEASING.md)。

## 用法

1. 在任意**已回答**的消息或文档里划选文字（文档包括 DSH 自带预览与 better-sidebar「审查」页的 CodeMirror）。选区保持浏览器原生高亮，`Ctrl/Cmd+C` 照常可用。
2. 选区旁出现「✎ 添加注释」小胶囊；点它才浮出批注卡片：写一句话，按 **Enter** 或点右侧圆形 ✓ 保存；Esc 或点空白处取消。卡片打开期间引用文字持续高亮。
3. 选区末尾出现**编号小圆标**（① ② ③…），点它回到编辑：删除 / 取消 / 保存。
4. 输入框**底部工具栏**出现「N 条注释」，悬停或点击展开列表：逐条编辑、删除，右上角「清空」可一次删掉本轮全部。
5. 正常输入并发送；附录自动追加在正文最后面，发送后清单清空。

附录**总是追加在用户输入最后面**：宿主完成文件等引用的序列化后，插件在原生发送入口追加本次注释。保存注释、打字、停顿、点击和移动光标都不会插入零宽字符或隐藏引用。

宿主接受消息后清除本次注释及角标；发送失败时保留注释，便于重试。请求期间新添加或修改的注释会保留。

## 编辑并重发用户消息

用户消息下方的「时间 + 复制」操作行中常驻铅笔，尺寸与复制按钮一致。点击「编辑消息」后，原气泡正文切换为多行编辑框，右下角为「取消 / 发送」；取消或 Esc 恢复原消息。

本功能由本插件自己的 Host 模块实现，**不依赖第三方回退插件，也不调用 `/rewind`**。浏览器只提交原消息 ID、序号、修改后的正文及幂等请求 ID，原始正文与附件均由 Host 读取。

Host 校验目标仍在有效历史内后，停止当前执行，在原生 maintenance 阶段串行替换目标及其之后的模型上下文，并重新投递编辑后的消息。检查点在首次新请求的有效 step 内归一，不向模型加入额外消息；原始事件日志保留，刷新和重启后仍能恢复替换状态。只改变对话，不回退工作区文件。主输入框中的未发送草稿保留。

重复请求只投递一次；失效的历史位置、取消、权限不足或保存失败会显示错误并保留编辑内容。保存失败的同次请求可重试。子代理会话暂不支持；已被上下文压缩的消息仍可键盘浏览，暂不支持编辑重发。

## 输入框调出历史用户输入

主输入框中按 **↑ / Page Up** 调出上一条历史用户输入，按 **↓ / Page Down** 调出下一条。调出完整正文，保留换行；可修改后通过主输入框正常发送，发送会**追加新一轮对话**，不会回退原有对话。

第一次调出前保存当前语义草稿；向下越过最新输入时恢复该草稿，包括引用 chip。浏览期间对已调出文字的修改可来回切换保留，会话之间互不混用。历史附件不自动复制；当前输入框的附件仍由宿主管理。仅含附件、没有正文的历史消息会跳过。

主输入框内的四个无修饰按键用于历史调出，因此不再用于纵向移动光标。Ctrl / Cmd / Alt / Shift 组合键、输入法组词、补全菜单、命令模式、提交过程及原地编辑框保持原有行为。异步读取期间继续打字或切换会话时，旧结果不会覆盖新草稿。

## 键盘按用户消息滚动

在聊天记录区域使用 **↑ / ↓** 或 **Page Up / Page Down**，滚动到上一条 / 下一条用户消息。到达首尾时停止，不循环。较早记录尚未加载时，先通过当前 Session 加载对应历史。

这是独立的浏览导航：不会进入编辑态，不会把历史文字填进输入框。主输入框使用上节的历史调出；其他文本输入框、原地编辑框、CodeMirror、弹窗，以及带 Ctrl / Cmd / Alt / Shift 的按键保持原有行为。

## 模型实际收到的内容

宿主完成正文引用序列化后，插件在发送时追加注释，和用户正文在**同一条消息**里，用 `---` 分隔：

```plaintext
<用户输入框里的正文>

---

〔注释〕以下是我对你输出的注释，请结合引用内容理解我的意图。

- 针对：第 3 轮回答
  引用：
  > 这里为什么要保留 failover？
  注释：解释太简略，补充 native failover 与现有实现的差异。

- 针对：文件 docs/e2e.md 第 42–45 行
  引用：
  > 现有 31 项原生接口测试没有开启 native failover……
  注释：这一段需要重写，并补两条 fork 用例。
```

正文为空时保持原生占位符，待输入正文后发送。

## 实现方式（零上游改动）

- **通道**：通过当前版本 `ui-conversation` 的 `conversation.sendSession` 入口追加附录，不向编辑器插入字符或引用节点。保留原生正文序列化、附件、投递模式和取消信号；仅在消息接收成功后删除本批注释。插件停用时恢复原入口。
- **旧草稿兼容**：按引用来源清除旧版注释引用及其零宽字符，保留其他文件引用和用户原文；旧注释 codec 不再输出附录，避免重复追加。
- **锚点**：消息用 `[data-chat-node-key]` + `[data-chat-turn]` + 引用文本；文档用预览渲染器的
  `data-document-markdown` / `data-code-preview` / `data-textpreview-plain`（含 `data-textpreview-line`）/
  `data-pdf-preview` 根。锚点失效时保留原文快照，仍可发送。
- **高亮**：CSS Custom Highlight API（`::highlight(dsh-annotation)`），不修改任何渲染器 DOM；
  不支持的浏览器降级为无内联高亮。
- **存储**：浏览器 `localStorage` 的 `dsh.annotation.v1`，按会话过滤；刷新后保留待发送注释；发送或删除后清除，不提供恢复。改名继续使用原存储键，保留已有待发送注释。

## 已知限制

- 流式生成中的回答不允许注释（定稿后才出现胶囊）。
- 注释内容上限：单条引用 2000 字符。
- CodeMirror（审查页）选区会带上行号：优先读行号 gutter，取不到时退回可见行序号。
- 图片、HTML、表格预览暂不提供注释入口。
- 文档引用记录可取得的起止行；尚未接入文件版本号和文档修改后的自动偏移提示。不会把未知版本或行号编造进附录。
- 删除即删除，不提供恢复；需要就重新添加。
- 输入框为空时保持原生占位符，清空正文不会删除待发送注释；可使用“清空全部”删除注释。
- 插件是 profile 级安装的：对所有会话生效。
- 页面暴露了只读调试入口 `window.__dshAnnotation`（`items()` / `probe(sessionId)`），供自动化验收使用。

## 滚动与列表编辑

- 注释编号按浏览器帧更新位置；滚动期间只更新位置，不重绘整套工具栏。
- 编号受原文所在滚动容器的可视边界限制；原文滚出顶部、底部输入区域或文档侧栏时隐藏，返回可视区后恢复。
- 从底部“待发送注释”列表编辑时，编辑框紧邻列表展开；空间不足时在列表上方或下方排列。列表保持可见，支持取消、保存和清空。
- 点击正文编号时，仍在原文附近编辑。

## 验收

- `DSH_WEB_URL='http://127.0.0.1:3080/?token=…' node test/input-e2e.mjs`：实际输入框与原生发送链路检查（6 项；发送使用本地会话替身，不提交真实会话消息）。默认选择 `Greeting`，可通过 `DSH_SESSION_TITLE` 指定其他已有对话。

- `node test/submission.mjs`：输入不插字符、正文末尾附录、附件与投递模式、并发、失败重试及停用恢复（12 项）；旧入口 `test/trailing.mjs` 转发到此脚本。
- `node test/legacy-input.mjs`：旧注释引用清理、文件引用偏移、待发送记录和命令保护（6 项）。

- `node test/annotation-geometry.mjs`：生产客户端与真实浏览器布局，覆盖逐帧跟随、聊天区和文档侧栏裁剪、列表旁编辑、窄窗口排列及清空时关闭编辑（14 项）。无需登录令牌，可用 `DSH_GEOMETRY_OUTPUT` 指定截图与报告目录。

- `node test/history-recall.mjs`：两组按键调出完整输入、草稿与引用恢复、会话隔离、加载竞态、菜单与输入法保护（13 项）。

- `node test/history-host.mjs`：原生 Session 历史替换、重放、附件、并发去重与持久化恢复（10 项）。
- `node test/history-agent.mjs`：原生 Agent、JSONL 持久化、本地模型替身及 DeepSeek 传输层序列化（5 项，不调用真实模型）。
- `node test/history-gateway.mjs`：真实 Gateway 的会话解析、输入验证、权限与编辑调用（4 项）。
- `node test/history-keyboard.mjs`：键盘跳转、输入保护、历史加载和清理（6 项）。

- `node test/edit-message.mjs`：操作行挂载、正文隔离、原地编辑/取消、UUID 对应的真实序号、服务端失败保护、请求 ID 保留（14 项断言）。

- `node test/harness.mjs`：jsdom + 真实 React 的集成夹具，覆盖 选区→胶囊→评论→待发送清单→悬停列表→编辑→删除→序列化（27 项断言，包含生产中英文词条与输入法回归）。
- `node test/codemirror.mjs`：复刻 better-sidebar「审查」页的 CodeMirror DOM（无 data-* 属性），验证 `.cm-content` 选区能出胶囊并取到路径。
- `DSH_WEB_URL='http://127.0.0.1:3080/?token=…' node test/e2e.mjs`：真实浏览器验收（需要进程级 token）；不发送消息，结束时恢复草稿、主题与语言。默认使用本次核对会话；可用 `DSH_SESSION_ID`、`DSH_SESSION_TITLE`、`DSH_DOCUMENT_PATH`、`DSH_DOCUMENT_TITLE` 指定其他已有会话与文档。`DSH_TEST_OUTPUT` 指定报告与截图目录，浏览器依赖路径可用 `PLAYWRIGHT_MODULE`、`CHROMIUM_EXECUTABLE` 覆盖。

## 排查

浮层用 `popover="manual"` + `showPopover()` 渲染在浏览器**顶层（top layer）**：右栏如果是以 `<dialog>` 或 popover 打开的，普通 `z-index` 永远盖不过它，只有同样进 top layer 才看得见。环境不支持时自动退化为普通 `position: fixed`。

`__dshAnnotation.trace()` 返回最近 12 次划选判定（`reason` 为 `ok` / `no-selection` / `not-document` / `popover-open`，含 `surface`、`rect`、`path`），控制台同时打印 `[annotation] gesture …`。


控制台里 `[annotation] active v13 annotations without draft characters` 表示当前页面加载的是这一版。

- `__dshAnnotation.lastGesture()`：最近一次划选的判定结果（`reason=ok|no-selection|popover-open|not-document`，含 `anchorClass/paneClass/path/rect`）。**在文档里划完选再执行它**，不受选区是否还在影响。
- `__dshAnnotation.diagnose()`：针对**当前**选区做同样判定；注意它读的是页面当前选区，若你先去点控制台选了命令文本，就会看到 `reason: chat`。

## 卸载

在插件管理里停用 `dsh-annotation-rewind-scroll`，或从 profile 移除该 bundle。待发送注释和历史编辑审计记录使用独立的稳定标识，不随包名变化。
