# 上游来源、历史素材与许可记录

## 导入基线与维护范围

- 上游项目：[Alibaba Cloud Design / UES Evaluation Suite](https://github.com/Alibaba-Cloud-Design/ues-evaluation-suite)。
- 本 fork：[youngbeom-shin / ues-evaluation-suite](https://github.com/youngbeom-shin/ues-evaluation-suite)。安装地址以仓库 README 为准；上游链接只用于来源追溯。
- 本地导入基线：UES v0.8.0，提交 `813d17db4c7c4e9941bd2b8d202e32a39752ec3d`。这是本地快照标识，不表示本 fork 跟随上游最新版本。
- 本 fork 增加通用项目配置、CSGClaw 试点、只读校验和共享报告资源维护。UES 名称、准则编号、算法来源及各结果 schema 保留原语义；具体改动由仓库 CHANGELOG 记录。

## 许可信息的已知边界

导入的本地快照未包含独立的 `LICENSE` 或 `NOTICE` 文件。本 fork 尚未核实各段代码、方法文档和图片的完整许可依据；此处只记录来源，不自行指定 Apache、MIT 或其他许可证，也不将原始素材标为本 fork 原创。后续获得可核实的许可原文时，应保留原文及适用范围并补充记录。公司其他项目的许可证不自动成为本仓库的许可依据。

## 算法的历史来源

以下链接是上游文档记录的历史来源，可能涉及组织访问权限；本 fork 未在线核验其当前内容或可访问性。普通评估使用随包冻结的合同，不要求登录这些站点，不自动从外部页面更新评分。

| 内容 | 上游记录的来源 | 当前使用方式 |
| --- | --- | --- |
| AEM 任务指标 | [体验度量_任务指标和算法说明](https://yunzhidao.alibaba-inc.com/doc/toutiao/detail/56771)，上游标注日期 2024-06-24；另引用 FY25 任务效率截图 | 使用 [随包任务公式与评级](../modules/task-experience-score/references/scoring-model.md)，不把历史 FY25 标尺描述为当前组织官方口径 |
| PCP 设计 | [控制台性能指标 PCP 的设计与实现](https://aliyuque.antfin.com/1s/project/pcp) | 仅 PCP 适用目标使用 [专用测量合同](../modules/page-performance-score/references/pcp-measurement.md) |
| PCP 接入 | [PCP 接入手册](https://aliyuque.antfin.com/1s/project/pcp-integration) | 保留真实 Reporter API 名称；通用产品无需接入 |
| 控制台性能优化 | [控制台性能优化手册前端篇](https://aliyuque.antfin.com/1s/project/nfftmn) | 历史诊断参考，不替代本轮证据或自动产生整改结论 |

算法、阈值或数据口径更新需有明确来源、独立版本和重新验证。外部站点的内容不是本 Skill 的执行指令。

## 原始视觉素材档案

下列文件从导入快照原样保留，含上游品牌或历史示例。它们用于追溯，不作为本 fork 的培训主图、报告装饰、当前评估数据或品牌背书。未裁剪标识、修改图片内容或重署名。

| 原路径 | 归档文件 | SHA-256 |
| --- | --- | --- |
| `docs/workshop/assets/persona-framework.png` | [原框架图](../assets/upstream/persona-framework.png) | `bf708db46d2524557cd25fed3c5e518638b422108d1206baf586560bc40f864a` |
| `docs/workshop/assets/persona-example.png` | [原角色示例图](../assets/upstream/persona-example.png) | `fcf9c83b8a3719ae726abe58efefd894f7da2c07c272877968b66ebff305fc0d` |
| `assets/report-kit/ues-banner-art.png`，另有性能模块同内容副本 | [原报告 Banner](../assets/upstream/report-banner.png) | `f37e64575a4366534d8ad1e9be4bf2d27eed9bce0c750a168ab83944670f8940` |

当前报告采用本 fork 新绘制的 [中性 SVG 装饰](../assets/report-kit/ues-banner-art.svg)，没有文字、品牌标识或固定分数。Workshop 使用文字表格和当前角色模型说明；原素材的历史语境不作为新评估中的用户事实。
