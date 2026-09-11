# AGENTS — ride-dash 项目约定

## 项目信息

- **项目**:骑行码表(网页版)——纯前端静态应用,无后端、无构建步骤
- **线上地址**:https://632-8nm.github.io/ride-dash/(GitHub Pages,main 分支根目录自动部署)
- **仓库**:https://github.com/632-8nm/ride-dash
- **目录结构**:
  ```
  index.html        页面骨架(约 80 行,只含 DOM 结构)
  css/style.css     应用样式
  css/leaflet.css   Leaflet 1.9.4(本地 vendored,无 CDN 依赖)
  js/app.js         全部业务逻辑(定位/计时/设置/心率/GPX)
  js/leaflet.js     Leaflet 1.9.4
  ```
- **技术栈**:原生 HTML/CSS/JS + Leaflet + 高德瓦片(显示用 GCJ-02 纠偏)+ Geolocation API + Web Bluetooth(心率)+ Wake Lock API + localStorage
- **数据**:轨迹/距离/用时仅存手机 localStorage,不经过任何服务器;支持导出 GPX 1.1
- **部署流程**:改动 → 提交推送 main → Pages 约 1 分钟后自动生效
- **本地调试**:`python -m http.server 8765` 后访问 http://localhost:8765(定位权限仅 localhost/HTTPS 可用)

## Git 规则(必须遵守)

1. **所有 git 操作必须先征得用户明确同意**——包括但不限于 `git add`、`git commit`、`git push`、`git reset`、分支与远程操作。未经同意不得执行任何改变仓库状态的命令;只读命令(`git status`、`git log`、`git diff`)可直接执行。
2. **提交信息必须规范且使用英文**,遵循 Conventional Commits 格式:

   ```
   <type>(<scope>): <short summary in imperative mood>
   ```

   - 常用 type:`feat`、`fix`、`docs`、`style`、`refactor`、`perf`、`chore`
   - 示例:`feat(map): add locate button with GCJ-02 offset correction`
   - 首字母小写,结尾不加句号,正文(如有)与标题空一行
3. 提交前确认工作区改动与提交信息一致;禁止把无关文件混入同一提交。
