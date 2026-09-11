# AGENTS — ride-dash 项目约定

## 项目信息

- **项目**:骑行码表(网页版)——纯前端单文件应用,无后端
- **核心文件**:`index.html`(HTML + CSS + JS 全部内置,含内联的 Leaflet 1.9.4)
- **线上地址**:https://632-8nm.github.io/ride-dash/(GitHub Pages,main 分支根目录自动部署)
- **仓库**:https://github.com/632-8nm/ride-dash
- **技术栈**:Leaflet(已内联,无 CDN 依赖)+ 高德瓦片(显示用 GCJ-02 纠偏)+ Geolocation API + Wake Lock API + localStorage
- **数据**:轨迹/距离/用时仅存手机 localStorage,不经过任何服务器;支持导出 GPX 1.1
- **辅助文件**:`serve-https.py`(本地 HTTPS 调试用,非必需)、`leaflet.js` / `leaflet.css`(内联源,留作升级)
- **部署流程**:改 `index.html` → 提交推送 main → Pages 约 1 分钟后自动生效

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
