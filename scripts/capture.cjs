// Gecici dogrulama scripti: build edilmis renderer'i yukler ve shot.png'ye gorunto alir.
// Kullanim: npx electron scripts/capture.cjs
const { app, BrowserWindow } = require('electron')
const path = require('path')
const fs = require('fs')

app.disableHardwareAcceleration()

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1200,
    height: 820,
    show: false,
    backgroundColor: '#0a0e10',
    webPreferences: { offscreen: false }
  })

  const indexPath = path.join(__dirname, '..', 'out', 'renderer', 'index.html')
  await win.loadFile(indexPath)

  // Fontlar + texture'lar yerlessin diye kisa bekleme
  await new Promise((r) => setTimeout(r, 1500))

  // Currency sekmesine gec (CAPTURE_MODE=currency ise)
  if (process.env.CAPTURE_MODE === 'currency') {
    await win.webContents.executeJavaScript(`
      (() => {
        const btns = [...document.querySelectorAll('.tb-tab')];
        const c = btns.find((b) => /Currency|Para/i.test(b.textContent));
        if (c) c.click();
      })();
    `)
    await new Promise((r) => setTimeout(r, 1200))
  }

  // Items sekmesine gec + zengin bir taban (hasar + implicit) sec
  if (process.env.CAPTURE_MODE === 'items') {
    await win.webContents.executeJavaScript(`
      (() => {
        const btns = [...document.querySelectorAll('.tb-tab')];
        const c = btns.find((b) => /Items|Eşya/i.test(b.textContent));
        if (c) c.click();
      })();
    `)
    await new Promise((r) => setTimeout(r, 600))
    await win.webContents.executeJavaScript(`
      (() => {
        const rows = [...document.querySelectorAll('.gem-row')];
        const r = rows.find((x) => /Artillery Bow|Topçu Yay/i.test(x.textContent));
        if (r) r.click();
      })();
    `)
    await new Promise((r) => setTimeout(r, 1000))
  }

  // Uniques sekmesine gec + taninir bir unique (turuncu ad) sec
  if (process.env.CAPTURE_MODE === 'uniques') {
    await win.webContents.executeJavaScript(`
      (() => {
        const btns = [...document.querySelectorAll('.tb-tab')];
        const c = btns.find((b) => /Uniques|Eşsiz/i.test(b.textContent));
        if (c) c.click();
      })();
    `)
    await new Promise((r) => setTimeout(r, 600))
    await win.webContents.executeJavaScript(`
      (() => {
        const rows = [...document.querySelectorAll('.gem-row')];
        const r = rows.find((x) => /Belly of the Beast|Canavarın Karnı/i.test(x.textContent));
        if (r) r.click();
      })();
    `)
    await new Promise((r) => setTimeout(r, 1000))
  }

  // Mods sekmesine gec + zengin bir mod sec
  if (process.env.CAPTURE_MODE === 'mods') {
    await win.webContents.executeJavaScript(`
      (() => {
        const btns = [...document.querySelectorAll('.tb-tab')];
        const c = btns.find((b) => /Mods|Özellik/i.test(b.textContent));
        if (c) c.click();
      })();
    `)
    await new Promise((r) => setTimeout(r, 1200))
    // Item türü filtresini "Kolye" (amulet) yap — filtre etiketi doğrulanır
    await win.webContents.executeJavaScript(`
      (() => {
        const sels = [...document.querySelectorAll('.filter-row .class-filter')];
        const it = sels[sels.length - 1];
        if (it) {
          const opt = [...it.options].find((o) => /Kolye|Amulet/i.test(o.textContent));
          if (opt) { it.value = opt.value; it.dispatchEvent(new Event('change', { bubbles: true })); }
        }
      })();
    `)
    await new Promise((r) => setTimeout(r, 800))
    // Tier ladder'ı göstermek için listeden bir mod seç
    await win.webContents.executeJavaScript(`
      (() => {
        const rows = [...document.querySelectorAll('.gem-row')];
        const flat = rows.find((x) => x.textContent.indexOf('+# maksimum Can') >= 0);
        const r = flat || rows[0];
        if (r) r.click();
      })();
    `)
    await new Promise((r) => setTimeout(r, 1800))
  }

  // Areas sekmesine gec + bağlantılı/bosslu bir kampanya zonu sec
  if (process.env.CAPTURE_MODE === 'areas') {
    await win.webContents.executeJavaScript(`
      (() => {
        const btns = [...document.querySelectorAll('.tb-tab')];
        const c = btns.find((b) => /Areas|Bölge/i.test(b.textContent));
        if (c) c.click();
      })();
    `)
    await new Promise((r) => setTimeout(r, 1000))
    await win.webContents.executeJavaScript(`
      (() => {
        const rows = [...document.querySelectorAll('.gem-row')];
        const r = rows.find((x) => /Cemetery|Mezarlığı/i.test(x.textContent)) || rows[0];
        if (r) r.click();
      })();
    `)
    await new Promise((r) => setTimeout(r, 1500))
  }

  // Ascendancies sekmesine gec + zengin bir yükseliş (Infernalist) sec
  if (process.env.CAPTURE_MODE === 'ascendancies') {
    await win.webContents.executeJavaScript(`
      (() => {
        const btns = [...document.querySelectorAll('.tb-tab')];
        const c = btns.find((b) => /Ascendancies|Yükseliş/i.test(b.textContent));
        if (c) c.click();
      })();
    `)
    await new Promise((r) => setTimeout(r, 800))
    await win.webContents.executeJavaScript(`
      (() => {
        const rows = [...document.querySelectorAll('.gem-row')];
        const r = rows.find((x) => /Infernalist|Cehennemci/i.test(x.textContent)) || rows[0];
        if (r) r.click();
      })();
    `)
    await new Promise((r) => setTimeout(r, 1200))
  }

  // Passives sekmesine gec + bir keystone sec (vurgulu)
  if (process.env.CAPTURE_MODE === 'passives') {
    await win.webContents.executeJavaScript(`
      (() => {
        const btns = [...document.querySelectorAll('.tb-tab')];
        const c = btns.find((b) => /Passives|Pasifler/i.test(b.textContent));
        if (c) c.click();
      })();
    `)
    await new Promise((r) => setTimeout(r, 900))
    // Arama kutusuna yeni node anahtarı yaz (Azmeri companion + mekanik node'lar)
    const PASS_QUERY = process.env.PASS_QUERY || 'Companion'
    await win.webContents.executeJavaScript(
      "(() => { const inp = document.querySelector('input.search'); if (inp) { const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set; s.call(inp, " +
        JSON.stringify(PASS_QUERY) +
        "); inp.dispatchEvent(new Event('input', { bubbles: true })); } })();"
    )
    await new Promise((r) => setTimeout(r, 800))
    await win.webContents.executeJavaScript(`
      (() => {
        const rows = [...document.querySelectorAll('.gem-row')];
        const want = ${JSON.stringify(process.env.PASS_PICK || 'Bond of the Owl')};
        const r = rows.find((x) => x.textContent.indexOf(want) >= 0) || rows[0];
        if (r) r.click();
      })();
    `)
    await new Promise((r) => setTimeout(r, 1000))
  }

  // Passives > Ağaç (görsel pasif ağaç): sınıf-merkez + arama vurgu + hover tooltip
  if (process.env.CAPTURE_MODE === 'passives-tree') {
    await win.webContents.executeJavaScript(`
      (() => {
        const btns = [...document.querySelectorAll('.tb-tab')];
        const c = btns.find((b) => /Passives|Pasifler/i.test(b.textContent));
        if (c) c.click();
      })();
    `)
    await new Promise((r) => setTimeout(r, 700))
    // "Ağaç" alt-geçişine tıkla
    await win.webContents.executeJavaScript(`
      (() => {
        const t = [...document.querySelectorAll('.pv-subtab')].find((b) => /Ağaç|Tree/i.test(b.textContent));
        if (t) t.click();
      })();
    `)
    await new Promise((r) => setTimeout(r, 900))
    // Sınıf seç (PoE 2): Witch -> merkeze gelsin
    const TREE_CLASS = process.env.TREE_CLASS || 'Witch'
    await win.webContents.executeJavaScript(
      "(() => { const sel = document.querySelector('.pv-class select'); if (sel) { const o = [...sel.options].find((x) => x.value === " +
        JSON.stringify(TREE_CLASS) +
        "); if (o) { sel.value = o.value; sel.dispatchEvent(new Event('change', { bubbles: true })); } } })();"
    )
    await new Promise((r) => setTimeout(r, 700))
    // Ascendancy navigasyonu (opsiyonel): TREE_ASC=Witch1 gibi
    if (process.env.TREE_ASC) {
      await win.webContents.executeJavaScript(
        "(() => { const sels = [...document.querySelectorAll('.pv-class select')]; const sel = sels[1]; if (sel) { const o = [...sel.options].find((x) => x.value === " +
          JSON.stringify(process.env.TREE_ASC) +
          "); if (o) { sel.value = o.value; sel.dispatchEvent(new Event('change', { bubbles: true })); } } })();"
      )
      await new Promise((r) => setTimeout(r, 700))
    }
    // Arama vurgusu (highlight). TREE_Q=NONE -> arama yok (temiz görünüm)
    const TREE_Q = process.env.TREE_Q == null ? 'Energy Shield' : process.env.TREE_Q
    if (TREE_Q !== 'NONE') {
      await win.webContents.executeJavaScript(
        "(() => { const inp = document.querySelector('.pv-search'); if (inp) { const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set; s.call(inp, " +
          JSON.stringify(TREE_Q) +
          "); inp.dispatchEvent(new Event('input', { bubbles: true })); } })();"
      )
      await new Promise((r) => setTimeout(r, 700))
    }
    // Hover: canvas merkezine mousemove -> seçilen sınıfın start node tooltip'i
    await win.webContents.executeJavaScript(`
      (() => {
        const cv = document.querySelector('.pv-canvas');
        if (!cv) return;
        const r = cv.getBoundingClientRect();
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        cv.dispatchEvent(new MouseEvent('mousemove', { clientX: cx, clientY: cy, bubbles: true }));
      })();
    `)
    await new Promise((r) => setTimeout(r, 700))
  }

  // Atlas / Endgame sekmesi: alt-filtre seç + listeden bir kayıt seç
  if (process.env.CAPTURE_MODE === 'atlas') {
    await win.webContents.executeJavaScript(`
      (() => {
        const btns = [...document.querySelectorAll('.tb-tab')];
        const c = btns.find((b) => /Atlas/i.test(b.textContent));
        if (c) c.click();
      })();
    `)
    await new Promise((r) => setTimeout(r, 700))
    // alt-tip filtresi (ATLAS_SUB: waystone|atlas_node|tablet|pinnacle_key)
    if (process.env.ATLAS_SUB) {
      await win.webContents.executeJavaScript(
        "(() => { const sel = document.querySelector('.filter-row .class-filter'); if (sel) { sel.value = " +
          JSON.stringify(process.env.ATLAS_SUB) +
          "; sel.dispatchEvent(new Event('change', { bubbles: true })); } })();"
      )
      await new Promise((r) => setTimeout(r, 500))
    }
    // Ağaç görünümü (ATLAS_VIEW=tree): "Ağaç" alt-geçişine tıkla + opsiyonel arama/hover
    if (process.env.ATLAS_VIEW === 'tree') {
      await win.webContents.executeJavaScript(`
        (() => {
          const t = [...document.querySelectorAll('.pv-subtab')].find((b) => /Ağaç|Tree/i.test(b.textContent));
          if (t) t.click();
        })();
      `)
      await new Promise((r) => setTimeout(r, 900))
      if (process.env.ATLAS_TREE_Q) {
        await win.webContents.executeJavaScript(
          "(() => { const inp = document.querySelector('.pv-search'); if (inp) { const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set; s.call(inp, " +
            JSON.stringify(process.env.ATLAS_TREE_Q) +
            "); inp.dispatchEvent(new Event('input', { bubbles: true })); } })();"
        )
        await new Promise((r) => setTimeout(r, 700))
      }
      // opsiyonel zoom: yoğun küme üzerine tekerlek (ATLAS_ZOOM = adım sayısı)
      const zoomSteps = Number(process.env.ATLAS_ZOOM || 0)
      if (zoomSteps > 0) {
        await win.webContents.executeJavaScript(
          "(() => { const cv = document.querySelector('.pv-canvas'); if (!cv) return; const r = cv.getBoundingClientRect();" +
          " const x = r.left + r.width*0.5, y = r.top + r.height*0.62;" +
          " for (let i=0;i<" + zoomSteps + ";i++) cv.dispatchEvent(new WheelEvent('wheel', { deltaY: -120, clientX: x, clientY: y, bubbles: true })); })();"
        )
        await new Promise((r) => setTimeout(r, 700))
      }
      // hover: ızgara tarayıp bir node'a denk gelene kadar dene -> tooltip
      await win.webContents.executeJavaScript(`
        (() => {
          const cv = document.querySelector('.pv-canvas');
          if (!cv) return;
          const r = cv.getBoundingClientRect();
          for (let gy = 0.30; gy <= 0.75; gy += 0.04) {
            for (let gx = 0.30; gx <= 0.70; gx += 0.03) {
              cv.dispatchEvent(new MouseEvent('mousemove', { clientX: r.left + r.width*gx, clientY: r.top + r.height*gy, bubbles: true }));
              if (document.querySelector('.pv-tip')) return;
            }
          }
        })();
      `)
      await new Promise((r) => setTimeout(r, 600))
    } else {
      // listeden bir kayıt seç (ATLAS_PICK metni içeren satır, yoksa ilk satır)
      await win.webContents.executeJavaScript(`
        (() => {
          const rows = [...document.querySelectorAll('.gem-row')];
          const want = ${JSON.stringify(process.env.ATLAS_PICK || '')};
          const r = (want && rows.find((x) => x.textContent.indexOf(want) >= 0)) || rows[0];
          if (r) r.click();
        })();
      `)
      await new Promise((r) => setTimeout(r, 900))
    }
  }

  // Mechanics sekmesi: alt-filtre seç + listeden bir mekanik seç
  if (process.env.CAPTURE_MODE === 'mechanics') {
    await win.webContents.executeJavaScript(`
      (() => {
        const btns = [...document.querySelectorAll('.tb-tab')];
        const c = btns.find((b) => /Mechanics|Mekanik/i.test(b.textContent));
        if (c) c.click();
      })();
    `)
    await new Promise((r) => setTimeout(r, 700))
    if (process.env.MECH_SUB) {
      await win.webContents.executeJavaScript(
        "(() => { const sel = document.querySelector('.filter-row .class-filter'); if (sel) { sel.value = " +
          JSON.stringify(process.env.MECH_SUB) +
          "; sel.dispatchEvent(new Event('change', { bubbles: true })); } })();"
      )
      await new Promise((r) => setTimeout(r, 500))
    }
    await win.webContents.executeJavaScript(`
      (() => {
        const rows = [...document.querySelectorAll('.gem-row')];
        const want = ${JSON.stringify(process.env.MECH_PICK || 'Breach')};
        const r = rows.find((x) => x.textContent.indexOf(want) >= 0) || rows[0];
        if (r) r.click();
      })();
    `)
    await new Promise((r) => setTimeout(r, 1200))
  }

  // Bosses sekmesi: alt-filtre seç + listeden bir boss seç
  if (process.env.CAPTURE_MODE === 'bosses') {
    await win.webContents.executeJavaScript(`
      (() => {
        const btns = [...document.querySelectorAll('.tb-tab')];
        const c = btns.find((b) => /Bosses|Boss/i.test(b.textContent));
        if (c) c.click();
      })();
    `)
    await new Promise((r) => setTimeout(r, 700))
    if (process.env.BOSS_SUB) {
      await win.webContents.executeJavaScript(
        "(() => { const sel = document.querySelector('.filter-row .class-filter'); if (sel) { sel.value = " +
          JSON.stringify(process.env.BOSS_SUB) +
          "; sel.dispatchEvent(new Event('change', { bubbles: true })); } })();"
      )
      await new Promise((r) => setTimeout(r, 500))
    }
    await win.webContents.executeJavaScript(`
      (() => {
        const rows = [...document.querySelectorAll('.gem-row')];
        const want = ${JSON.stringify(process.env.BOSS_PICK || 'Arbiter')};
        const r = rows.find((x) => x.textContent.indexOf(want) >= 0) || rows[0];
        if (r) r.click();
      })();
    `)
    await new Promise((r) => setTimeout(r, 1200))
  }

  // Crafting sekmesi: alt-filtre seç + listeden bir kayıt seç
  if (process.env.CAPTURE_MODE === 'crafting') {
    await win.webContents.executeJavaScript(`
      (() => {
        const btns = [...document.querySelectorAll('.tb-tab')];
        const c = btns.find((b) => /Crafting|Üretim/i.test(b.textContent));
        if (c) c.click();
      })();
    `)
    await new Promise((r) => setTimeout(r, 700))
    if (process.env.CRAFT_SUB) {
      await win.webContents.executeJavaScript(
        "(() => { const sel = document.querySelector('.filter-row .class-filter'); if (sel) { sel.value = " +
          JSON.stringify(process.env.CRAFT_SUB) +
          "; sel.dispatchEvent(new Event('change', { bubbles: true })); } })();"
      )
      await new Promise((r) => setTimeout(r, 500))
    }
    await win.webContents.executeJavaScript(`
      (() => {
        const rows = [...document.querySelectorAll('.gem-row')];
        const want = ${JSON.stringify(process.env.CRAFT_PICK || '')};
        const r = (want && rows.find((x) => x.textContent.indexOf(want) >= 0)) || rows[0];
        if (r) r.click();
      })();
    `)
    await new Promise((r) => setTimeout(r, 1100))
  }

  // Isınma: ilk capturePage tıklama sonrası bir kare geç olabiliyor; at gitsin.
  await win.webContents.capturePage()
  await new Promise((r) => setTimeout(r, 200))

  const img = await win.webContents.capturePage()
  const out = path.join(__dirname, '..', 'shot.png')
  fs.writeFileSync(out, img.toPNG())
  console.log('Yazildi:', out)

  // Tooltip bolgesini yakindan incelemek icin kirpilmis ikinci gorunto
  const tip = await win.webContents.capturePage({ x: 392, y: 60, width: 800, height: 720 })
  const out2 = path.join(__dirname, '..', 'shot-tip.png')
  fs.writeFileSync(out2, tip.toPNG())
  console.log('Yazildi:', out2)
  app.quit()
})
