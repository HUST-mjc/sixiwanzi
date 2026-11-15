/**
 * Live2D 终极稳定版：固定大小、绝对贴底、严格对称
 * 适配 GitHub Pages / Vercel / 任何 HTTP 静态托管
 *
 * 注意：file:// 双击打开时不加载模型（浏览器禁止该协议下 fetch 本地文件），
 * 请使用「启动本地预览.bat」或本地服务器（Live Server 等）打开。
 */
(function () {
    'use strict';

    // ================= 1. file:// 拦截 =================
    if (window.location.protocol === 'file:') {
        console.info('[Live2D] file:// 本地预览不加载模型，请使用本地服务器打开。');
        return;
    }

    // ================= 2. 模型路径（相对路径，适配 GitHub Pages 子目录） =================
    // 顺序：左1, 左2, 右1, 右2
    const modelPaths = [
        './live2d/saichelian/saichelian.model3.json',       // 梨安（最左）
        './live2d/saichetiandou/saichetiandou.model3.json', // 恬豆（左侧靠内）
        './live2d/saichemumu/saicheMumu.model3.json',       // 沐霂（右侧靠内）
        './live2d/saicheyoyi/saicheyoyi.model3.json'        // 又一（最右）
    ];

    // ================= 3. 状态 =================
    let isLoaded = false;
    let waitTimer = null;
    let app = null;
    let loadedModels = [];
    let resizeHandler = null;
    let resizeObserver = null;

    // ================= 4. 初始化 =================
    function initLive2D() {
        if (isLoaded) return;

        // 4.1 依赖检查
        if (typeof PIXI === 'undefined' || !PIXI.live2d || !PIXI.live2d.Live2DModel) {
            console.error(
                '❌ [Live2D] PIXI 或 PIXI.live2d 未挂载。\n' +
                '请确认 index.html 中依次引入：\n' +
                '  JS/pixi.min.js → JS/live2dcubismcore.min.js → JS/cubism4.min.js\n' +
                '并确认这些文件已上传到服务器。'
            );
            return;
        }

        const heroArea = document.getElementById('comp-hero');
        const container = document.getElementById('live2d-container');
        const canvas = document.getElementById('live2d-stage');

        if (!heroArea || !container || !canvas) {
            console.error('❌ [Live2D] 缺少必要 DOM 节点（comp-hero / live2d-container / live2d-stage）。');
            return;
        }

        // 4.2 注入样式（仅注入一次）
        if (!document.getElementById('live2d-injected-style')) {
            const style = document.createElement('style');
            style.id = 'live2d-injected-style';
            style.innerHTML = `
                #comp-hero {
                    background-image: none !important;
                    background-color: transparent !important;
                    min-height: 550px !important;
                    position: relative !important;
                    display: flex;
                    flex-direction: column;
                    justify-content: flex-start;
                }
                #oml2d-container, .oml2d-widget { display: none !important; }
            `;
            document.head.appendChild(style);
        }

        // 4.3 挂载画布容器到 Hero
        heroArea.appendChild(container);

        // 文字浮在模型上方
        const heroContent = heroArea.querySelector('.hero-content') || heroArea.firstElementChild;
        if (heroContent && heroContent !== container) {
            heroContent.style.position = 'relative';
            heroContent.style.zIndex = '10';
            heroContent.style.marginTop = '50px';
        }

        // 4.4 容器绝对贴底
        const stageWidth = heroArea.clientWidth || window.innerWidth;
        const stageHeight = heroArea.clientHeight || 550;

        container.style.cssText = `
            position: absolute;
            bottom: 0;
            left: 0;
            width: 100%;
            height: 100%;
            pointer-events: none;
            z-index: 1;
            overflow: hidden;
        `;

        canvas.style.width = '100%';
        canvas.style.height = '100%';
        canvas.style.pointerEvents = 'auto';

        isLoaded = true;
        if (waitTimer) {
            clearInterval(waitTimer);
            waitTimer = null;
        }
        console.log('✅ [Live2D] 开始初始化舞台...');

        // 4.5 创建 PIXI 应用
        try {
            app = new PIXI.Application({
                view: canvas,
                width: stageWidth,
                height: stageHeight,
                transparent: true,
                autoStart: true,
                antialias: true,
                // 限制最高 2 倍，避免高 DPI 手机内存爆掉
                resolution: Math.min(window.devicePixelRatio || 1, 2),
            });
        } catch (err) {
            console.error('❌ [Live2D] PIXI.Application 创建失败：', err);
            return;
        }

        // 4.6 加载模型（独立容错）
        console.log(`[Live2D] 开始加载 ${modelPaths.length} 个模型...`);

        Promise.allSettled(modelPaths.map(path => PIXI.live2d.Live2DModel.from(path)))
            .then(results => {
                loadedModels = [];
                const failed = [];

                results.forEach((result, index) => {
                    const path = modelPaths[index];

                    if (result.status === 'fulfilled') {
                        const model = result.value;
                        try {
                            app.stage.addChild(model);
                            model.anchor.set(0.5, 1);       // 底边中心锚点
                            model.interactive = true;
                            model.on('hit', (hitAreas) => {
                                if (hitAreas.includes('body')) {
                                    try { model.motion('tap_body'); } catch (_) { /* 模型无此动作时忽略 */ }
                                }
                            });
                            loadedModels.push(model);
                            console.log(`✅ [Live2D] 模型加载成功 [${index}] ${path}`);
                        } catch (err) {
                            failed.push({ index, path, reason: err });
                            console.error(`❌ [Live2D] 模型添加舞台失败 [${index}] ${path}`, err);
                        }
                    } else {
                        failed.push({ index, path, reason: result.reason });
                        console.error(`❌ [Live2D] 模型加载失败 [${index}] ${path}`, result.reason);
                    }
                });

                // 失败汇总
                if (failed.length > 0) {
                    console.warn(
                        `⚠️ [Live2D] 共 ${failed.length} 个模型加载失败。\n` +
                        `请到浏览器 Network 面板确认以下路径是否 404，并核对服务器文件名大小写（GitHub Pages 区分大小写）：\n` +
                        failed.map(f => `  [${f.index}] ${f.path}`).join('\n')
                    );
                }

                if (loadedModels.length === 0) {
                    console.error('❌ [Live2D] 所有模型均加载失败，舞台无内容。');
                    return;
                }

                // 4.7 初始排版
                layoutModels();

                // 4.8 窗口 resize
                if (resizeHandler) window.removeEventListener('resize', resizeHandler);
                resizeHandler = () => {
                    if (!app || !app.renderer || !heroArea) return;
                    app.renderer.resize(
                        heroArea.clientWidth || window.innerWidth,
                        heroArea.clientHeight || 550
                    );
                    layoutModels();
                };
                window.addEventListener('resize', resizeHandler);

                // 4.9 Hero 尺寸变化（字体/图片加载后高度变化）自动重排
                if (typeof ResizeObserver !== 'undefined') {
                    if (resizeObserver) resizeObserver.disconnect();
                    resizeObserver = new ResizeObserver(() => {
                        if (!app || !app.renderer || !heroArea) return;
                        const w = heroArea.clientWidth || window.innerWidth;
                        const h = heroArea.clientHeight || 550;
                        if (Math.abs(app.screen.width - w) > 1 || Math.abs(app.screen.height - h) > 1) {
                            app.renderer.resize(w, h);
                            layoutModels();
                        }
                    });
                    resizeObserver.observe(heroArea);
                }
            })
            .catch(err => {
                console.error('❌ [Live2D] Promise.allSettled 异常：', err);
            });
    }

    // ================= 5. 排版核心逻辑 =================
    function layoutModels() {
        if (!app || !app.screen || loadedModels.length === 0) return;

        const stageWidth = app.screen.width;
        const stageHeight = app.screen.height;

        // 统一高度：不超过 450px
        const fixedHeight = Math.min(450, stageHeight * 0.9);
        const maxModelHeight = Math.max(...loadedModels.map(m => m.height));
        if (maxModelHeight <= 0) return;

        const globalScale = fixedHeight / maxModelHeight;

        // 缩放 + 绝对贴底
        loadedModels.forEach(m => {
            m.scale.set(globalScale);
            m.y = stageHeight;
        });

        // ---------- 少于 4 个模型：整体居中排布 ----------
        if (loadedModels.length < 4) {
            const gap = 15;
            const totalWidth =
                loadedModels.reduce((sum, m) => sum + m.width * globalScale, 0) +
                (loadedModels.length - 1) * gap;
            let cursor = (stageWidth - totalWidth) / 2;
            loadedModels.forEach(m => {
                const w = m.width * globalScale;
                m.x = cursor + w / 2;
                cursor += w + gap;
            });
            return;
        }

        // ---------- 4 个模型：左右两组严格对称 ----------
        const gap = 15;
        const centerX = stageWidth / 2;
        const centerGap = Math.min(320, stageWidth * 0.35);

        const leftEdgeX = centerX - (centerGap / 2);
        const rightEdgeX = centerX + (centerGap / 2);

        // 左侧（内 → 外）
        const modelLeft2 = loadedModels[1];
        const wLeft2 = modelLeft2.width * globalScale;
        modelLeft2.x = leftEdgeX - (wLeft2 / 2);

        const modelLeft1 = loadedModels[0];
        const wLeft1 = modelLeft1.width * globalScale;
        modelLeft1.x = leftEdgeX - wLeft2 - gap - (wLeft1 / 2);

        // 右侧（内 → 外）
        const modelRight1 = loadedModels[2];
        const wRight1 = modelRight1.width * globalScale;
        modelRight1.x = rightEdgeX + (wRight1 / 2);

        const modelRight2 = loadedModels[3];
        const wRight2 = modelRight2.width * globalScale;
        modelRight2.x = rightEdgeX + wRight1 + gap + (wRight2 / 2);
    }

    // ================= 6. 等待组件渲染 =================
    function startWaiting() {
        if (waitTimer) return;
        const MAX_WAIT = 15000;
        const START_TIME = Date.now();

        waitTimer = setInterval(() => {
            const heroArea = document.getElementById('comp-hero');
            if (heroArea && heroArea.innerHTML.trim() !== '') {
                clearInterval(waitTimer);
                waitTimer = null;
                setTimeout(initLive2D, 200);
            } else if (Date.now() - START_TIME > MAX_WAIT) {
                clearInterval(waitTimer);
                waitTimer = null;
                console.warn('[Live2D] ⚠️ 等待 Hero 区域超时（15s），组件可能未加载。');
            }
        }, 300);
    }

    // ================= 7. 入口 =================
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', startWaiting);
    } else {
        startWaiting();
    }
})();
