# GitLab Pages 报告发布

工具仓库：https://git-devops.opencsg.com/youngbeom/ues-evaluation-suite 。
Pages 地址以项目 **Deploy → Pages** 或 `CI_PAGES_URL` 为准。当前分配地址为 https://youngbeom.pages.opencsg.com/ues-evaluation-suite 。

## 分支与权限

`main` 保存 Skill 源码；GitLab 专用 `reports` 分支保存部署脚本、CI 配置和 `report-archive/<project_id>/<run_id>/` 发布包。每次完整构建历史报告，生成根目录索引和各报告独立链接。报告分支只推送公司 GitLab，不推送公开 GitHub。当前 GitLab 配置了上游拉取镜像；不要让报告分支参与公开上游同步，后续升级部署脚本时须单独同步到 `reports`。

Pages 当前访问策略是仅项目成员，项目 Internal 可见性不等同于 Pages 访问权限。发布后分别验证未登录入口与成员登录访问。不要为了排查问题放宽权限。一个站点中的所有报告共享相同访问策略，目录不隔离客户权限。

## 准备报告

先运行适用于该次评估的校验器。例如联合报告：

```bash
node skills/ues-expert-suite/scripts/validate_suite_report.mjs /path/to/run/assessment.json
node skills/ues-expert-suite/scripts/validate_html_report.mjs /path/to/run/report.html /path/to/run/assessment.json /path/to/run/diagnosis.json
```

准备发布元数据（保存到仓库外的 `publication-input.json`）：

```json
{
  "project_id": "csgclaw",
  "run_id": "csgclaw-ah-20261102-01",
  "product": "CSGClaw · AgenticHub 广场",
  "title": "AgenticHub 广场体验评估",
  "evaluated_at": "2026-11-02T08:46:13.897Z",
  "version": "unknown",
  "scope": "按该次评估填写已验证范围和限制",
  "summary": "按原报告填写主要结论，不补算缺失分数",
  "kind": "evaluation"
}
```

`project_id` 和 `run_id` 使用小写字母、数字、短横线或下划线。`kind=example` 专用于示例；真实评估用 `evaluation`。发布批次可以使用原始运行编号的小写形式，原始编号保留在评估 JSON 中。

```bash
node scripts/package_report.mjs /path/to/run report.html /path/to/publication-input.json /tmp/ux-report-archive assessment.json diagnosis.json evidence-index.json run-state.json
```

打包器从 HTML 入口递归收集本地链接、样式、脚本和 CSS 图片，额外文件由末尾参数明确指定；不直接复制整个评估工作目录。生成逐文件 SHA256 的 `publication.json`。JSON 中的证据路径不自动作为资源链接解析，需要额外包含实际所需的证据文件、配置快照和结果文件。JS 动态拼接的资源路径也需显式包含。发布前核对清单及内容，保留脱敏衍生物与原件的对应关系。

打包器拒绝重复批次、缺失资源、目录越界、符号链接、绝对本机/根路径和 `<base>`；`srcset` 需先在发布副本适配。外部 HTTP(S) 引用保留，不自动下载，须单独确认它们对查看者可用。浏览器脚本是报告本身的一部分，只发布可信的评估产物。

## 构建与发布

```bash
node scripts/test_report_publication.mjs
node scripts/build_report_site.mjs /tmp/ux-report-archive /tmp/ux-report-site
python3 -m http.server 8080 --directory /tmp/ux-report-site
```

输出目录必须不存在，构建成功才产生完整输出。核对首页、所有报告页、下载、角色卡、筛选、折叠与截图灯箱；多级相对 URL 不依赖某个固定域名。

将新发布包追加到 GitLab `reports` 分支的 `report-archive/`。该目录被源码分支的 `.gitignore` 忽略，在归档分支中需显式添加：

```bash
git add -f report-archive/<project_id>/<run_id>
git commit -m "docs: archive UX evaluation report"
git push gitlab HEAD:reports
```

上面命令只适用于已检出最新 `reports` 分支的工作副本，并已将 `gitlab` remote 指向公司仓库的情形。禁止 force push；遇到非快进先合并最新归档再发布。同一 `run_id` 不覆盖，补充或修订评估用新批次。

`.gitlab-ci.yml` 仅在 `reports` 分支运行，使用 Node 22 和在线 CPU Runner 共用的 `docker`、`shared` 标签，无 npm 依赖和额外部署令牌。镜像取自 Runner 已使用的华为云缓存，固定内容摘要；可通过 `UES_PAGES_IMAGE` 替换为其他经核实的公司镜像。首次测试已确认 Runner 直接连接 Docker Hub 会超时。

发布任务通过 `resource_group` 串行执行，构建前后核对归档分支最新 SHA；GitLab 自身的“防止过时部署”设置也应保持开启。最新提交的流水线成功后部署 `public/`，普通部署不自动过期；30 天 artifacts 保留期只针对 CI 下载产物，不是历史档案来源。

报告链接形式：`<CI_PAGES_URL>/reports/<project_id>/<run_id>/<entry>`。链接只有部署成功且访问验证通过后才作为已发布结果交付。

## 故障与恢复

- Pending：检查 Runner 在线状态和标签。
- 拉取镜像失败：向管理员确认允许的 Node 22 镜像源，修改 CI image 后重跑。
- 缺失资源/哈希不符：修复发布包后用新批次发布，保留原始报告。构建失败不上传新站点。
- HTTP 404：区分首次部署尚未完成、路径错误、访问权限和 Pages 服务配置；查看 Pages API / Deploy → Pages 的实际部署记录。
- 登录回调失败：管理员核对 Pages Access Control、DNS、证书与 OAuth 回调。
- 恢复：从 `reports` 分支的完整归档重新构建。需要撤回报告时提交删除该批次并重建；不要重置整个分支丢弃其他报告。

完整 Skill 现在也自带同一份打包与发布脚本，仓库根 `scripts/` 仅为调用入口，不再维护另一份实现。每轮自动发布的配置、输入、状态和恢复命令见 [Skill 发布合同](../skills/ues-expert-suite/references/gitlab-pages-publication.md)。本机已授权的自动模式不需要每轮重新提出发布请求；其他 Worker 需单独启用宿主配置并配置凭据。

站点生成根目录 `index.html`、机器目录 `reports.json`、各项目 `projects/<project_id>/index.html` 及所有批次的独立报告目录。首页与项目页支持搜索、项目筛选和日期排序。追加报告只创建新批次，完整重建时始终保留原报告。

这条流水线不执行产品评估，不自动向 Issue 发消息，也不创建 CSGClaw Worker。需求跟踪：[requirements #4164](https://git-devops.opencsg.com/product/agentichub/requirements/-/work_items/4164)。
