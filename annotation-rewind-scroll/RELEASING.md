# 发布到公共 npm

正式包名为 `dsh-annotation-rewind-scroll`。包的前端模块、bundle 与协议身份已同步；`publishConfig` 显式指向公共 npm，避免使用本机默认的其他镜像。当前版本为 `0.1.0`。

## 首次发布

```bash
cd ~/My/codespace/github/my-dsh-plugins/annotation-rewind-scroll
npm login --registry=https://registry.npmjs.org/
npm whoami --registry=https://registry.npmjs.org/
npm test
npm run pack:check
npm publish --dry-run --access public --registry=https://registry.npmjs.org/
npm publish --access public --registry=https://registry.npmjs.org/
```

`--dry-run` 不会发布；只有最后一条命令执行实际发布。交互登录和发布时按 npm 提示完成身份验证及双重验证。发布检查不会替你登录或上传软件包。

发布后核验：

```bash
npm view dsh-annotation-rewind-scroll version dist.integrity --registry=https://registry.npmjs.org/
```

npm 包名由首次成功发布的账号持有。当前名称是否可用，需要以发布时的 npm 返回为准。若要作为开源项目分发，请在发布前补充你选定的许可证及对应 LICENSE 文件。

## 后续版本

同一个包名和版本不能覆盖发布。升级版本时不自动生成 Git 提交或标签：

```bash
npm version patch --no-git-tag-version
npm test
npm run pack:check
npm publish --dry-run --access public --registry=https://registry.npmjs.org/
npm publish --access public --registry=https://registry.npmjs.org/
```

## 包内文件

通过 `files` 白名单发布 Host、浏览器入口、历史模块、locale、图标、README 与本说明。测试、预览截图、开发核对记录和本机登录链接均不进入 npm 包。`npm run pack:check` 校验打包清单、入口、包名以及本机路径残留；`prepublishOnly` 会在正式发布或发布预演前运行这一检查。

## Harness 安装

发布完成后，在插件管理页填写包名 `dsh-annotation-rewind-scroll` 并安装、启用。本地已存在同名目录链接时，先移除旧安装项，再安装 npm 版本。命令行安装包可用：

```bash
dsh plugin --profile web add dsh-annotation-rewind-scroll
```

若使用命令行安装，随后在插件管理页确认该 bundle 已启用。

参考：[npm 官方发布指南](https://docs.npmjs.com/creating-and-publishing-unscoped-public-packages/)、[npm publish](https://docs.npmjs.com/cli/v11/commands/npm-publish/)、[发布双重验证](https://docs.npmjs.com/requiring-2fa-for-package-publishing-and-settings-modification/)。
