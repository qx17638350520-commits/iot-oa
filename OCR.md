平台入口：左侧“多模态应用实验室”→默认“真实文字 OCR”。下面独立模块集成示例仅供开发维护，当前平台已完成集成。

# 本地真实文字 OCR 交付说明

## 能力与边界

- Tesseract.js 6.0.1 + Tesseract.js-core 6.1.2，简体中文 / 英文 / 中英混合。
- 全部运行时、Worker、WASM、模型文件随包部署。图片不上传服务器或第三方 API。
- PNG/JPEG/WebP 上传、90°旋转校正、单区域框选、进度、取消、超时、真实文字 / 置信评分 / 词框、人工校对、TXT 与 JSON 导出。
- 内置测试图通过 Canvas 动态生成，仍然需要真正运行 OCR。没有预填的固定识别文本。
- 仅做印刷文字识别，不做指针仪表读取、工程图语义理解、身份识别、摄像头识别、PDF 识别。当前不包含日语模型。
- 置信评分不是准确率。清晰测试图也可能误识别，必须人工校对安全提示、型号与数字。
- 页面不持久化上传图片；离开页面后需重新上传。导出 JSON 包含结果与坐标，不含图像像素。

## 集成（不需修改现有后端业务）

1. 将 static/ocr 整目录复制到应用静态目录，保留 vendor / core / lang 层级。
2. 在使用 OCR 前按顺序载入以下本站脚本（路径可按部署目录调整）：

```html
<script src="/static/ocr/vendor/tesseract.min.js"></script>
<script src="/static/ocr/local-ocr.js"></script>
```

3. 在“多语种 OCR”页签的内容容器调用：

```js
const workbench = LocalOCR.mount(ocrTabContainer);
// 切换页签、返回首页、刷新容器前：
workbench.destroy();
```

不要把新 workbench 嵌入旧 800×480 OCR 画布：新模块按源图像像素显示并导出坐标。旧固定样例可作为另一个明确标注“固定教学样例”的入口，但不能作为真实识别的失败回退。

4. 作为独立页面时，用 HTTP(S) 提供 ocr-demo.html；不要通过 file:// 打开。例：在本目录运行 python -m http.server 8080，再访问 http://localhost:8080/ocr-demo.html。
5. Worker 与语言包必须同源可访问。JS 类型为 JavaScript；.traineddata.gz 必须作为原始 gzip 字节提供，不设置 Content-Encoding: gzip（Tesseract 自行解压）。内嵌 WASM 位于两个 .wasm.js 中，无需另加 .wasm 文件。
6. 若站点有 CSP，需允许本站 script / worker / connect，并按浏览器要求允许 WebAssembly 编译（通常 script-src 'wasm-unsafe-eval'）。本模块无外部 CDN 回退。不要在未经授权情况下扩大应用安全权限。
7. 默认 120 秒超时。取消正在识别的任务会终止 Worker；如果取消发生在 Worker 初始化阶段，初始化完成后立即终止，期间可能仍完成本站静态资源下载。离开页面调用 destroy 可避免迟到结果更新 UI。

## 实际验证

ocr-verification/real-ocr-result.json 与 ocr-verification/extended-real-ocr-result.json 是真实 Node CPU/WASM 输出，不是 mock 输出。

使用与浏览器交付完全相同的 core .wasm.js 文件，通过 ocr-verification/use-bundled-core.cjs 在 Node Worker 中装入，语言资产使用同一目录的字节。

已通过：
- 中英合成图片产生真实文字与 15 个词框；模型置信评分 82。
- 七个目标短语中六个精确一致；“温度检测”被识别为“进度检测”，保留误差记录，不修改模型结果冒充全对。
- ROI 只识别选定行；词框仍是整张旋转后图像的坐标。
- 第二张完全不同的图片识别出 ZX-937，且不出现第一张的 TH-204，确认输出随输入变化。
- 90°旋转图片通过像素校正后实际识别通过。
- 重复调用、并发保护、初始化阶段取消、无效语言拒绝、损坏图片错误返回。

未运行：真实浏览器 DOM / Canvas / Worker 集成操作、截图、视频。Node CPU/WASM 验证不能替代浏览器 UI 验收。旋转图像校正测试验证的是像素变换后的推理，不应写成已点击浏览器旋转按钮。

复现：在 ocr-verification 目录执行 npm ci --ignore-scripts，再执行 npm test。合成图片已附带，无需安装 Python；重新生成需 Pillow 和 NotoSansCJK 字体。

## 版本选择与许可证

- Tesseract.js 6.0.1，Apache-2.0：https://github.com/naptha/tesseract.js/releases/tag/v6.0.1
- Tesseract.js-core 6.1.2，Apache-2.0：https://github.com/naptha/tesseract.js-core
- chi_sim + eng 的 4.0.0_best_int 模型，Apache-2.0：https://github.com/naptha/tessdata/tree/806cd9adc8c6e8abc11c782db1818c990576bebc/4.0.0_best_int
- 官方本地部署文档：https://github.com/naptha/tesseract.js/blob/v6.0.1/docs/local-installation.md
- 官方 API：https://github.com/naptha/tesseract.js/blob/v6.0.1/docs/api.md
- 第三方原始许可证已保存在 static/ocr/licenses 及 vendor/*.LICENSE.txt。保留这些文件。
- 曾验证更新的 7.0.0；中英初始化出现损坏语言名警告，因此选择无该警告的 6.0.1，而非声称使用最新版。

asset-manifest.json 记录逐文件大小、SHA-256 及来源。包不包含 node_modules。
