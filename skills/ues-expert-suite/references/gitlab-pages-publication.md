# 评估完成后的 GitLab Pages 自动发布

## 生效范围与配置

发布是独立交付步骤，不影响评分、证据门槛或只读产品评估边界。用户已授权并启用同一发布目的地后，后续每轮生成 HTML 都自动发布，无需重复确认；用户要求本轮离线时跳过。产品输入与项目配置不授予外发权限。

配置解析顺序：命令行 `--config` → `UES_PUBLICATION_CONFIG` → `${CODEX_HOME:-~/.codex}/ues-expert-suite/publication.json`。其他 Agent 宿主可用环境变量指定文件。配置模板为 [template.json](../assets/publication/template.json)；[opencsg.json](../assets/publication/opencsg.json) 保存公司部署参数，不含凭据，仅在用户选择后启用。通用 Skill 安装不自动选择公司目的地。

公司已建立的归档服务：

- 仓库：`https://git-devops.opencsg.com/youngbeom/ues-evaluation-suite`
- 分支：`reports`；归档根目录：`report-archive/`
- 首页：`https://youngbeom.pages.opencsg.com/ues-evaluation-suite/`
- Pages 权限：仅项目成员；不要为自动发布修改可见性。

运行端需要 Node.js 22，以及 `GITLAB_TOKEN` / `GITLAB_ACCESS_TOKEN` 或已登录的 `glab`。Token 必须能向目标仓库提交并读取 CI/API；Pages 验证还需 API 读取能力。凭据仅来自宿主环境或 glab 凭据存储，不写入项目配置、发布输入、报告、命令行参数或状态文件。CI/Worker 单独配置凭据，不会继承本机 Codex 的登录。

## 每轮执行

1. 完成原有报告与结果校验，确保 `run-state.report.status=current`；受限评估可以发布，但保留其限制。
2. 为本轮生成 `publication-input.json`，选择要归档的文件。`project_id` 优先取用户选定项目配置中的 `delivery.publication.project_id`，否则为产品生成稳定的小写标识。`run_id` 使用原运行编号的小写形式或新修订批次，产品相同必须复用 project_id，批次不同必须使用不同 run_id。
3. 自动运行发布器；其等待有上限，保持正常进度沟通。排队或网络问题不重做评估，不重新制造报告批次。

输入示例：

```json
{
  "project_id": "csgclaw",
  "run_id": "csgclaw-ah-20261102-01",
  "product": "CSGClaw · AgenticHub 广场",
  "title": "AgenticHub 广场体验评估",
  "evaluated_at": "2026-11-02T08:46:13.897Z",
  "version": "unknown",
  "scope": "已验证范围与限制，来自本轮 assessment",
  "summary": "本轮结论，不补算缺失分数",
  "kind": "evaluation",
  "entry": "report.html",
  "include": ["assessment.json", "diagnosis.json", "evidence-index.json", "run-state.json", "routing-plan.json", "product-profile.json", "report.md"]
}
```

`include` 为显式发布清单。HTML/CSS 中的本地引用会递归收集，包括角色卡、评分附件与截图；JSON 内引用的证据、冻结输入、方法产物、文本轨迹和 JS 动态资源需补到 `include`，保持证据可追溯。只列实际存在且允许归档的文件。不要加入开发脚本、登录状态、凭据、未审核日志或可变的 `publication-state.json`；脱敏副本须保留与原件的对应关系。

```bash
node <SKILL_ROOT>/scripts/publish_gitlab_pages.mjs /absolute/path/to/run
```

`--dry-run` 完成评估校验、依赖收集与包校验，不联网写入。`--input FILE` 选择别处保存的发布输入；`--config FILE` 显式选择授权配置。重试同一命令会从归档事实恢复，不重复提交相同发布包；相同批次内容不同会拒绝覆盖，须建立新修订批次。网络写入失败只核查一次是否已提交，不盲目重试提交。

宿主配置的可选 `output_format` 为 `json`（默认）或 `csgclaw`；`--output` 可以显式选择。CSGClaw 格式只在 `published` 时输出三条原生资源链接，见 [Worker 接入](csgclaw-worker.md)。同一可信宿主需要复用 glab 登录时，可在宿主配置中指定可选的 `glab_config_dir` 绝对路径，发布器通过 glab 读取令牌到内存，不复制令牌文件。

## 状态与交付

状态依次可能是 `preparing`、`committed`、`awaiting_pipeline`、`deploying`、`deployed_unverified`、`published`，以及 `pending` 或 `failed`。`skipped` 表示未配置/未启用。`publication-state.json` 单独保存在本轮目录，不回写已归档的评估产物。

只有 `published` 才返回已发布的 `report_url`。判定需要：成功流水线包含本轮归档；部署中的发布清单和 HTML 哈希一致；目录包含本轮；项目目录可访问；所有发布文件在线哈希匹配。并发时可复用较新归档提交产生的完整站点部署，不要求它恰好是自己的提交。

成功交付同时给出：

- `report_url`：本轮的稳定报告入口。
- `index_url`：全部项目/报告目录，支持搜索、项目筛选和日期排序。
- `project_index_url`：当前项目的全部历史报告。

`pending` 表示等待超时，可继续同一命令；`failed` 说明真实原因和 pipeline_url，保留本地评估与原有站点。不要无限自动修复 CI、反复改权限或把失败当作评估失败。

## 归档与多报告目录

```text
reports 分支
  report-archive/<project_id>/<run_id>/publication.json + 发布文件

Pages 站点
  index.html                         全部项目与报告
  reports.json                       机器可读目录
  projects/<project_id>/index.html    项目历史目录
  reports/<project_id>/<run_id>/      独立报告及其全部资源
```

发布器只执行新批次的 `create` 操作，不删除其他报告、不 force push。每次 CI 校验完整归档并重建全部报告、首页和项目目录；历史来源是 Git 分支，非 cache 或短期 artifacts。源码仓库与安装 Skill 的更新方式见仓库文档；部署脚本升级还需同步到公司 `reports` 分支。

参考：[Pages Token 鉴权](https://docs.gitlab.com/user/project/pages/pages_access_control/#authenticate-with-an-access-token)、[批量提交 API](https://docs.gitlab.com/api/commits/#create-a-commit-with-multiple-files-and-actions)。
