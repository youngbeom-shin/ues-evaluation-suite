# CSGClaw Worker 接入

CSGClaw 原生支持行式结构化输出：成功命令 stdout 中独占一行的 `::csgclaw-output::resource_link <单行 JSON>` 会被 Runtime 解码，并以可点击链接附加到会话回复。该 Skill 的发布器输出三条链接，不需要改造 CSGClaw 前端或下载 Pages 页面。

## 安装与配置

1. 将完整 `ues-expert-suite/` 目录制成 ZIP，通过 CSGClaw 全局 Skills 上传入口导入，再在专用 Worker 的 Profile → Skills 中添加。保留全部模块、脚本、资源和权限；替换旧副本前保留备份。
2. 为专用 Worker 配置模型引用和宿主 Codex 运行时，安装 Node.js 22，并确认 GitLab / Pages 网络可达。只读执行模式不能运行发布脚本。
3. 复制已授权目的地的发布配置到 Worker 的 `$CODEX_HOME/ues-expert-suite/publication.json`，设置 `enabled=true`、`mode=auto` 和 `output_format=csgclaw`。其他运行时通过 `UES_PUBLICATION_CONFIG` 指定配置文件。
4. 配置该 Worker 可用的 `GITLAB_TOKEN` / `GITLAB_ACCESS_TOKEN`，优先使用仅限报告项目的 Developer 级项目访问令牌（提交 REST API 需 `api` scope），通过 CSGClaw 的 Worker 环境配置注入，并记录到期日以便轮换。不要把令牌写入 Skill、报告、发布输入或提示词。同一可信宿主且凭据存储可访问时，也可设置宿主配置中的 `glab_config_dir` 为 `glab config path --dir` 返回的已有登录目录；隔离 Worker 可能无法访问宿主钥匙串，此时使用独立项目凭据，不放宽沙箱。远程或容器 Worker 不使用宿主绝对路径。
5. Worker 指令可采用 [worker-instructions.md](../assets/csgclaw/worker-instructions.md)，保留模板自身的运行与团队任务规则。

`glab_config_dir` 是运行端的授权配置，不放入通用项目配置或报告发布清单。它不创建新 Token，也不改变 Token 原有权限。Worker 需能在 PATH 中找到 Node 和 glab。

Developer 无权读取 GitLab 的 Pages 设置 API 时，发布器核对项目身份并只使用宿主事先批准的 Pages URL，然后继续验证线上清单、HTML、目录和全部发布文件；不为读取设置而把发布 Token 升为 Maintainer。

## 输出与验证

自动模式从宿主配置读取输出格式。也可显式指定：

```bash
node <SKILL_ROOT>/scripts/publish_gitlab_pages.mjs <RUN_DIR> --output csgclaw
```

只有在线报告、目录和全部发布文件验证通过后，才输出“本轮 UX 评估报告 / 项目历史报告 / 全部 UX 评估报告”三条控制记录。失败、排队、未验证状态均不输出这些控制记录。记录只允许同一归档站点内的 HTTPS URL，不带凭据、查询参数或片段。

接入验收需要在真实 Worker 中执行发布器，并检查 CSGClaw 会话里三个链接的标题与地址，而不只是在宿主终端看到控制行。使用已有已验证报告作幂等验证，不生成虚构评分，不覆盖原批次；另需完成后续真实评估及问题复测。

原生协议说明见 CSGClaw 仓库的 `docs/tech/structured-output.zh.md`。发布步骤、输入清单和恢复行为见 [自动发布合同](gitlab-pages-publication.md)。
