/**
 * verify_crop_fidelity.js — 裁剪源画质门禁。
 *
 * 用法：
 *   node tools/verify_crop_fidelity.js            # 验证 src/ 里的图与裁剪源
 *   node tools/verify_crop_fidelity.js --dump     # 额外导出区域对比图到 .snap/
 *
 * 为什么需要这个门禁：
 *   展板放大功能靠 canvas 从全分辨率原图裁出局部，展板小字要看得清。
 *   裁剪源改成 WebP 后，压缩痕迹会直接落在小字上 —— 肉眼难分辨，
 *   必须用数值守住：每个热点区域的 PSNR 不得低于阈值。
 *
 * 判据（三条同时成立）：
 *   C1 裁剪源与源 JPEG 像素尺寸完全一致 —— 尺寸不同则 analysisRegions
 *      的百分比坐标会算错，裁出来的区域会整体偏移。
 *   C2 每个热点区域的 PSNR ≥ 33 dB（实测当前 35.5~37.6 dB，
 *      留 2.5 dB 余量给重新编码的正常波动；质量降到 40 时会掉到 ~28 dB）。
 *   C3 裁剪源与源图的宽高比偏差 < 0.1% —— 变体高度取整必然带来微小偏差，
 *      偏差过大会让"屏上热点框"与"裁剪区域"对不上。
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const IMG = path.join(ROOT, 'src', 'img');
const OUT = path.join(ROOT, '.snap');
const PW_CHROME = 'C:/Users/EDY/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe';
const PSNR_MIN = 33;
const ASPECT_ERR_MAX = 0.001;

const dataJs = fs.readFileSync(path.join(ROOT, 'src', 'js', 'data.js'), 'utf-8');
const cases = JSON.parse(dataJs.match(/window\.MUSEUM_DATA\s*=\s*(\[[\s\S]*?\]);/)[1]);

const results = [];
function check(name, pass, detail) {
  results.push({ name, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
}

(async () => {
  const dump = process.argv.includes('--dump');
  const browser = await chromium.launch({ executablePath: PW_CHROME });
  const page = await browser.newPage();
  await page.goto('about:blank');

  for (const c of cases) {
    const tag = path.basename(c.image);
    if (!c.imageFull) { check(`${tag} 声明裁剪源 imageFull`, false, 'data.js 缺少 imageFull'); continue; }
    const jpgPath = path.join(IMG, path.basename(c.image));
    const webpPath = path.join(IMG, path.basename(c.imageFull));
    if (!fs.existsSync(webpPath)) { check(`${tag} 裁剪源文件存在`, false, c.imageFull); continue; }

    const jpgB64 = fs.readFileSync(jpgPath).toString('base64');
    const webpB64 = fs.readFileSync(webpPath).toString('base64');

    const r = await page.evaluate(async ({ jpgB64, webpB64, regions }) => {
      const load = (b64, type) => new Promise((res, rej) => {
        const im = new Image();
        im.onload = () => res(im);
        im.onerror = () => rej(new Error('decode fail'));
        im.src = `data:${type};base64,${b64}`;
      });
      const a = await load(jpgB64, 'image/jpeg');
      const b = await load(webpB64, 'image/webp');
      const px = (im) => {
        const cv = document.createElement('canvas');
        cv.width = im.naturalWidth; cv.height = im.naturalHeight;
        const ctx = cv.getContext('2d');
        ctx.drawImage(im, 0, 0);
        return { w: cv.width, h: cv.height, data: ctx.getImageData(0, 0, cv.width, cv.height).data };
      };
      const pa = px(a), pb = px(b);
      const psnr = (x0, y0, w, h) => {
        let s = 0;
        for (let y = y0; y < y0 + h; y++) {
          for (let x = x0; x < x0 + w; x++) {
            const i = (y * pa.w + x) * 4;
            for (let ch = 0; ch < 3; ch++) { const d = pa.data[i + ch] - pb.data[i + ch]; s += d * d; }
          }
        }
        const mse = s / (w * h * 3);
        return mse === 0 ? 99 : 10 * Math.log10(255 * 255 / mse);
      };
      const out = (regions || []).map((rg) => {
        const W = pa.w, H = pa.h;
        const x0 = Math.round(W * rg[0] / 100), y0 = Math.round(H * rg[1] / 100);
        const w = Math.min(W - x0, Math.round(W * rg[2] / 100));
        const h = Math.min(H - y0, Math.round(H * rg[3] / 100));
        return { x0, y0, w, h, psnr: Number(psnr(x0, y0, w, h).toFixed(2)) };
      });
      return {
        jpg: [pa.w, pa.h], webp: [pb.w, pb.h],
        aspectErr: Math.abs(pa.w / pa.h - pb.w / pb.h) / (pa.w / pa.h),
        regions: out,
      };
    }, { jpgB64, webpB64, regions: c.analysisRegions });

    check(`${tag} 裁剪源与源图同尺寸`,
      r.jpg[0] === r.webp[0] && r.jpg[1] === r.webp[1],
      `源 ${r.jpg.join('x')} / 裁剪源 ${r.webp.join('x')}`);
    check(`${tag} 宽高比偏差 < 0.1%`, r.aspectErr < ASPECT_ERR_MAX,
      `${(r.aspectErr * 100).toFixed(3)}%`);
    if (r.regions.length) {
      const mn = Math.min(...r.regions.map((x) => x.psnr));
      check(`${tag} 热点区域 PSNR ≥ ${PSNR_MIN} dB`, mn >= PSNR_MIN,
        `最低 ${mn} dB（${r.regions.length} 个区域）`);
    } else {
      check(`${tag} 有热点区域可测`, false, 'analysisRegions 为空');
    }

    if (dump) {
      for (let i = 0; i < Math.min(2, r.regions.length); i++) {
        const rg = r.regions[i];
        const composed = await page.evaluate(async ({ jpgB64, webpB64, rg }) => {
          const load = (b64, type) => new Promise((res) => { const im = new Image(); im.onload = () => res(im); im.src = `data:${type};base64,${b64}`; });
          const a = await load(jpgB64, 'image/jpeg');
          const b = await load(webpB64, 'image/webp');
          const cv = document.createElement('canvas');
          cv.width = rg.w * 2 + 12; cv.height = rg.h;
          const ctx = cv.getContext('2d');
          ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
          ctx.drawImage(a, rg.x0, rg.y0, rg.w, rg.h, 0, 0, rg.w, rg.h);
          ctx.drawImage(b, rg.x0, rg.y0, rg.w, rg.h, rg.w + 12, 0, rg.w, rg.h);
          return cv.toDataURL('image/png');
        }, { jpgB64, webpB64, rg });
        const fp = path.join(OUT, `fidelity_${path.basename(c.image, '.jpg')}_r${i + 1}.png`);
        if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
        fs.writeFileSync(fp, Buffer.from(composed.split(',')[1], 'base64'));
        console.log(`      → ${path.relative(ROOT, fp)}（左=源 JPEG，右=裁剪源）`);
      }
    }
  }

  await browser.close();
  const fails = results.filter((r) => !r.pass).length;
  console.log(`\n=== 结果：${results.length} PASS / ${fails} FAIL ===`);
  process.exit(fails ? 1 : 0);
})();
