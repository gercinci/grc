# -*- coding: utf-8 -*-
"""Hamamböceği fıkrası - 15 sn dikey (9:16) komedi videosu."""
import math, random, subprocess, os, wave
import numpy as np
from PIL import Image, ImageDraw, ImageFont

OUT = os.path.dirname(os.path.abspath(__file__))
W, H, FPS, DUR = 720, 1280, 30, 15.0
S = 2  # süpersampling
NF = int(DUR * FPS)
SR = 44100
FB = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
_fc = {}
def font(sz):
    k = int(sz * S)
    if k not in _fc:
        _fc[k] = ImageFont.truetype(FB, k)
    return _fc[k]

def P(v): return int(round(v * S))
def clamp(x, a=0.0, b=1.0): return max(a, min(b, x))
def ease_out(x): x = clamp(x); return 1 - (1 - x) ** 3
def ease_back(x):
    x = clamp(x); c1 = 1.70158; c3 = c1 + 1
    return 1 + c3 * (x - 1) ** 3 + c1 * (x - 1) ** 2

# ---------------------------------------------------------------- ses
def voice(name, args, text, pitch_up=1.0):
    path = os.path.join(OUT, name + ".wav")
    subprocess.run(["espeak-ng"] + args.split() + ["-w", path, text], check=True)
    with wave.open(path) as w:
        sr = w.getframerate()
        a = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32768
    # sessizlikleri kırp
    idx = np.where(np.abs(a) > 0.02)[0]
    a = a[max(0, idx[0] - 200): idx[-1] + 400]
    # SR'ye taşı (+ istenirse sincap efekti)
    n = int(len(a) * SR / sr / pitch_up)
    a = np.interp(np.linspace(0, len(a) - 1, n), np.arange(len(a)), a)
    return a / (np.max(np.abs(a)) + 1e-9) * 0.9

VO = {
    "ev":     voice("ev", "-v tr+m3 -p 22 -s 190", "Evi nasıl teslim aldıysan, öyle teslim edeceksin!"),
    "c1":     voice("c1", "-v tr+m1 -p 55 -s 215", "Dört yüz doksan yedi"),
    "c2":     voice("c2", "-v tr+m1 -p 55 -s 215", "doksan sekiz"),
    "c3":     voice("c3", "-v tr+m1 -p 55 -s 215", "doksan dokuz"),
    "roach":  voice("roach", "-v tr+f4 -p 80 -s 175", "Beni yakalayamazsın!", pitch_up=1.3),
    "bes":    voice("bes", "-v tr+m1 -p 60 -s 170", "Beş yüüüz!"),
    "teslim": voice("teslim", "-v tr+m1 -p 50 -s 195", "Aldığım gibi teslim ettim abi!"),
    "scream": voice("scream", "-v tr+m3 -p 99 -s 150", "Aaaaaaaaa!", pitch_up=1.15),
}
for k, v in VO.items():
    print(f"{k}: {len(v)/SR:.2f}s")

# konuşma zamanlaması (başlangıç sn) -> ağız animasyonu için de kullanılır
T = {"ev": 0.25, "c1": 3.85, "c2": 5.15, "c3": 6.3, "roach": 7.85,
     "bes": 9.75, "teslim": 11.35, "scream": 12.75}
def speaking(key, t):
    st = T[key]; en = st + len(VO[key]) / SR
    return st <= t <= en

def build_audio():
    n = int(DUR * SR); mix = np.zeros(n, np.float32)
    def add(sig, t0, g=1.0):
        i = int(t0 * SR); j = min(n, i + len(sig))
        if i < n: mix[i:j] += sig[: j - i] * g
    tt = lambda d: np.arange(int(d * SR)) / SR
    rng = np.random.default_rng(3)

    # --- arka plan müziği: zıplayan komik döngü (128 bpm)
    bpm = 128; beat = 60 / bpm
    bass = [43, 43, 50, 50, 41, 41, 48, 47]          # midi
    mel = [67, 0, 71, 74, 72, 0, 69, 71, 67, 0, 64, 67, 69, 71, 72, 0]
    mf = lambda m: 440 * 2 ** ((m - 69) / 12)
    music = np.zeros(n, np.float32)
    def put(sig, t0):
        i = int(t0 * SR); j = min(n, i + len(sig))
        if i < n: music[i:j] += sig[: j - i]
    b = 0; t0 = 0.0
    while t0 < DUR:
        # bas (her vuruş)
        d = beat * 0.9; x = tt(d); f = mf(bass[(b // 2) % 8] - 12)
        put((np.sign(np.sin(2 * np.pi * f * x)) * 0.5 + np.sin(2 * np.pi * f * x)) * np.exp(-x * 6) * 0.22, t0)
        # kick
        if b % 2 == 0:
            x = tt(0.18); put(np.sin(2 * np.pi * (120 * np.exp(-x * 25) + 45) * x) * np.exp(-x * 18) * 0.6, t0)
        else:  # clap
            x = tt(0.15); put(rng.standard_normal(len(x)).astype(np.float32) * np.exp(-x * 30) * 0.18, t0)
        # hi-hat (yarım vuruş)
        for h in (0, beat / 2):
            x = tt(0.04); put(rng.standard_normal(len(x)).astype(np.float32) * np.exp(-x * 120) * 0.07, t0 + h)
        # pizzicato melodi (yarım vuruş)
        for h in range(2):
            m = mel[(b * 2 + h) % 16]
            if m:
                x = tt(0.2); f = mf(m)
                put((np.sin(2 * np.pi * f * x) + 0.3 * np.sin(4 * np.pi * f * x)) * np.exp(-x * 14) * 0.13, t0 + h * beat / 2)
        b += 1; t0 += beat
    # konuşma sırasında müziği kıs (ducking)
    duck = np.ones(n, np.float32)
    for k, st in T.items():
        i = int(st * SR); j = min(n, i + len(VO[k]))
        duck[i:j] = 0.45
    duck = np.convolve(duck, np.ones(2000) / 2000, mode="same")
    music *= duck
    # son vuruş sonrası müzik kesilsin (ba-dum-tss için)
    cut = int(14.15 * SR); music[cut:] *= np.linspace(1, 0, n - cut) ** 4
    mix += music * 0.8

    # --- efektler
    def pop(t0, f=900):
        x = tt(0.09); add(np.sin(2 * np.pi * (f + 1800 * x / 0.09) * x) * np.exp(-x * 40) * 0.5, t0)
    def whoosh(t0, d=0.45, g=0.35):
        x = tt(d); nz = rng.standard_normal(len(x)).astype(np.float32)
        nz = np.convolve(nz, np.ones(12) / 12, mode="same")
        add(nz * np.sin(np.pi * x / d) ** 2 * g * 2, t0)
    def thud(t0):
        x = tt(0.4); add(np.sin(2 * np.pi * (90 * np.exp(-x * 8) + 40) * x) * np.exp(-x * 9) * 0.95, t0)
        x = tt(0.12); add(rng.standard_normal(len(x)).astype(np.float32) * np.exp(-x * 40) * 0.35, t0)
    def scurry(t0, d, g=0.12):
        x = tt(d); clicks = (rng.random(len(x)) < 0.004).astype(np.float32)
        clicks = np.convolve(clicks, np.exp(-np.arange(60) / 8), mode="same")
        env = np.minimum(1, np.minimum(x / 0.3, (d - x) / 0.3))
        add(clicks * env * g, t0)
    def slide_whistle(t0, d=0.5, f0=500, f1=1500):
        x = tt(d); f = f0 + (f1 - f0) * (x / d)
        add(np.sin(2 * np.pi * np.cumsum(f) / SR) * np.sin(np.pi * x / d) * 0.22, t0)
    def rimshot(t0):
        for k, dt in enumerate((0, 0.22)):  # ba-dum
            x = tt(0.25)
            add(np.sin(2 * np.pi * (180 - 30 * k) * x) * np.exp(-x * 14) * 0.6
                + rng.standard_normal(len(x)).astype(np.float32) * np.exp(-x * 25) * 0.25, t0 + dt)
        x = tt(1.0)  # tss
        nz = rng.standard_normal(len(x)).astype(np.float32)
        nz = nz - np.convolve(nz, np.ones(6) / 6, mode="same")
        add(nz * np.exp(-x * 3.5) * 0.45, t0 + 0.5)

    whoosh(0.0, 0.35, 0.25)
    scurry(0.2, 3.4, 0.05)
    whoosh(3.55, 0.4, 0.3)
    for i, tc in enumerate([3.95, 4.35, 4.75, 5.2, 5.6, 6.0, 6.35, 6.75, 7.1]):
        pop(tc, 700 + 120 * i)
    scurry(3.7, 3.8, 0.1)
    whoosh(7.5, 0.4, 0.3)
    slide_whistle(7.6, 0.35, 600, 1400)
    slide_whistle(9.15, 0.45, 1600, 300)
    thud(9.6)
    whoosh(11.05, 0.4, 0.3)
    scurry(11.6, 3.0, 0.35)
    slide_whistle(12.6, 0.3, 400, 1800)
    rimshot(14.2)

    for k, st in T.items():
        add(VO[k], st, 1.0 if k != "scream" else 0.85)

    mix = np.tanh(mix * 1.1) * 0.95
    pcm = (mix * 32767).astype(np.int16)
    with wave.open(os.path.join(OUT, "audio.wav"), "w") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())

build_audio()

# ---------------------------------------------------------------- çizim yardımcıları
BROWN, BROWN_L, BROWN_D = (110, 58, 28), (160, 96, 50), (40, 20, 8)
INK = (25, 18, 14)

def rot(px, py, th):
    c, s = math.cos(th), math.sin(th)
    return px * c - py * s, px * s + py * c

def ell_poly(cx, cy, rx, ry, th=0.0, n=36):
    pts = []
    for i in range(n):
        a = 2 * math.pi * i / n
        x, y = rot(rx * math.cos(a), ry * math.sin(a), th)
        pts.append((P(cx + x), P(cy + y)))
    return pts

def ell(d, cx, cy, rx, ry, fill=None, outline=INK, w=3):
    d.ellipse([P(cx - rx), P(cy - ry), P(cx + rx), P(cy + ry)], fill=fill,
              outline=outline, width=P(w) if outline else 0)

def line(d, pts, fill=INK, w=3):
    d.line([(P(x), P(y)) for x, y in pts], fill=fill, width=max(1, P(w)), joint="curve")

def roach(d, x, y, th, L, t, phase=0.0, moving=True):
    """Üstten görünüş hamamböceği. th: kafa yönü (radyan)."""
    def tr(lx, ly):
        rx, ry = rot(lx * L, ly * L, th)
        return x + rx, y + ry
    sp = 18 if moving else 3
    lw = max(1.0, L * 0.09)
    # bacaklar
    for i, ax in enumerate((0.55, 0.15, -0.3)):
        for side in (-1, 1):
            ph = math.sin(t * sp + phase + i * 2.1 + (side > 0) * math.pi) * 0.25
            knee = tr(ax + 0.15 + ph * 0.3, side * 0.85)
            foot = tr(ax - 0.25 + (i - 1) * 0.35 + ph, side * 1.35)
            line(d, [tr(ax, side * 0.3), knee, foot], BROWN_D, lw)
    # antenler
    for side in (-1, 1):
        sw = math.sin(t * 6 + phase + side) * 0.25
        pts = [tr(1.25 + k * 0.32, side * (0.12 + k * 0.18 + sw * k * 0.12)) for k in range(6)]
        line(d, pts, BROWN_D, max(1.0, lw * 0.7))
    # gövde
    d.polygon(ell_poly(*tr(-0.25, 0), 1.05 * L, 0.55 * L, th), fill=BROWN, outline=BROWN_D, width=max(1, P(lw * 0.8)))
    line(d, [tr(0.5, 0), tr(-1.25, 0)], BROWN_D, max(1.0, lw * 0.6))
    d.polygon(ell_poly(*tr(-0.1, -0.22), 0.6 * L, 0.12 * L, th), fill=BROWN_L)
    d.polygon(ell_poly(*tr(0.75, 0), 0.32 * L, 0.48 * L, th), fill=(130, 72, 36), outline=BROWN_D, width=max(1, P(lw * 0.8)))
    d.polygon(ell_poly(*tr(1.12, 0), 0.18 * L, 0.24 * L, th), fill=(70, 36, 16))

def hero(d, x, y, sc, t, wink=False, dance=True, squash=0.0):
    """Gözlüklü, ayakta duran havalı hamamböceği (önden)."""
    bob = math.sin(t * 2 * math.pi * 128 / 60) if dance else 0
    y = y + abs(bob) * -8 * sc
    sway = bob * 6 * sc
    k = sc
    sy = 1 - squash * 0.5
    # bacaklar
    for side in (-1, 1):
        kick = max(0, bob * side) * 14 * k if dance else 0
        line(d, [(x + side * 18 * k, y + 55 * k * sy), (x + side * 30 * k + kick, y + 85 * k), (x + side * 26 * k + kick * 1.3, y + 110 * k)], BROWN_D, 7 * k)
    # alt kollar (4 kol: dans)
    for side in (-1, 1):
        a = bob * side * 0.6
        ex, ey = x + side * 58 * k, y + 25 * k + math.sin(a) * 20 * k
        line(d, [(x + side * 30 * k, y + 15 * k), (ex, ey), (ex + side * 18 * k, ey - 25 * k * math.cos(a))], BROWN_D, 6 * k)
        a2 = -bob * side * 0.8
        ex, ey = x + side * 62 * k + sway, y - 25 * k + math.sin(a2) * 20 * k
        line(d, [(x + side * 30 * k, y - 20 * k), (ex, ey), (ex + side * 10 * k, ey - 35 * k)], BROWN_D, 6 * k)
    # gövde
    ell(d, x, y + 20 * k, 42 * k, 62 * k * sy, BROWN, BROWN_D, 4 * k)
    line(d, [(x, y - 10 * k), (x, y + 78 * k * sy)], BROWN_D, 3 * k)
    ell(d, x - 18 * k, y + 15 * k, 10 * k, 30 * k, BROWN_L, None)
    # kafa
    hx, hy = x + sway * 0.5, y - 45 * k
    for side in (-1, 1):
        sw = math.sin(t * 5 + side) * 12 * k
        line(d, [(hx + side * 12 * k, hy - 25 * k), (hx + side * 35 * k + sw, hy - 75 * k),
                 (hx + side * 70 * k + sw * 1.5, hy - 105 * k)], BROWN_D, 4 * k)
    ell(d, hx, hy, 38 * k, 32 * k, (130, 72, 36), BROWN_D, 4 * k)
    # gözlük
    if wink:
        # gözlüğü indirip göz kırpar
        d.rounded_rectangle([P(hx - 34 * k), P(hy - 2 * k), P(hx + 34 * k), P(hy + 18 * k)], radius=P(6 * k), fill=(10, 10, 10))
        ell(d, hx - 15 * k, hy - 12 * k, 9 * k, 9 * k, (255, 255, 255), INK, 2 * k)
        ell(d, hx - 13 * k, hy - 11 * k, 4 * k, 4 * k, INK, None)
        line(d, [(hx + 6 * k, hy - 12 * k), (hx + 24 * k, hy - 12 * k)], INK, 3 * k)
    else:
        for side in (-1, 1):
            d.rounded_rectangle([P(hx + side * 4 * k - (30 * k if side < 0 else 0)), P(hy - 16 * k),
                                 P(hx + side * 4 * k + (30 * k if side > 0 else 0)), P(hy + 2 * k)],
                                radius=P(5 * k), fill=(10, 10, 10))
        line(d, [(hx - 6 * k, hy - 10 * k), (hx + 6 * k, hy - 10 * k)], (10, 10, 10), 3 * k)
        line(d, [(hx - 22 * k, hy - 12 * k), (hx - 14 * k, hy - 6 * k)], (240, 240, 255), 2 * k)
        line(d, [(hx + 14 * k, hy - 12 * k), (hx + 22 * k, hy - 6 * k)], (240, 240, 255), 2 * k)
    # sırıtış
    d.arc([P(hx - 16 * k), P(hy + 2 * k), P(hx + 16 * k), P(hy + 22 * k)], 15, 165, fill=INK, width=P(3 * k))

def person(d, x, y, kind, t, talk=False, mouth_o=False, kneel=False, arms="down", scared=False, look=1):
    """kind: 'landlord' (ev sahibi) | 'temel' (kiracı). y = ayak hizası."""
    if kind == "landlord":
        shirt, pants, skin = (90, 110, 160), (60, 60, 70), (238, 196, 160)
        bw = 78
    else:
        shirt, pants, skin = (200, 70, 60), (50, 60, 90), (232, 186, 145)
        bw = 62
    leg = 0 if kneel else 150
    hip = y - leg if not kneel else y - 70
    body_h = 190
    top = hip - body_h
    # bacaklar
    if kneel:
        d.rounded_rectangle([P(x - 50), P(y - 70), P(x + 40), P(y)], radius=P(25), fill=pants, outline=INK, width=P(3))
        ell(d, x + 52 * look, y - 10, 26, 12, (40, 30, 25))
    else:
        for side in (-1, 1):
            d.rounded_rectangle([P(x + side * 30 - 22), P(hip - 10), P(x + side * 30 + 22), P(y - 8)], radius=P(12), fill=pants, outline=INK, width=P(3))
            ell(d, x + side * 30 + 10 * look, y - 6, 30, 13, (40, 30, 25))
    # gövde
    d.rounded_rectangle([P(x - bw), P(top), P(x + bw), P(hip + 10)], radius=P(45), fill=shirt, outline=INK, width=P(3))
    if kind == "landlord":
        ell(d, x + 10 * look, hip - 40, 60, 55, shirt, INK, 3)  # göbek
        d.polygon([(P(x - 10), P(top + 5)), (P(x + 10), P(top + 5)), (P(x + 14), P(top + 110)), (P(x), P(top + 125)), (P(x - 14), P(top + 110))], fill=(170, 30, 40), outline=INK)
    # kollar
    for side in (-1, 1):
        sx, sy = x + side * (bw - 8), top + 40
        if arms == "up" or (scared):
            wob = math.sin(t * 30 + side) * 10
            pts = [(sx, sy), (sx + side * 45, sy - 60 + wob), (sx + side * 55, sy - 130 + wob)]
        elif arms == "point" and side == look:
            pts = [(sx, sy), (sx + side * 70, sy + 10), (sx + side * 130, sy - 10)]
        elif arms == "hold":
            pts = [(sx, sy), (sx + side * 25 + look * 40, sy + 70), (x + look * 75 + side * 30, sy + 85)]
        elif arms == "gesture":
            g = math.sin(t * 9 + side) * 18
            pts = [(sx, sy), (sx + side * 40, sy + 60), (sx + side * 70 + g, sy + 20 + g)]
        else:
            pts = [(sx, sy), (sx + side * 22, sy + 70), (sx + side * 20, sy + 140)]
        line(d, pts, INK, 25); line(d, pts, shirt, 19)
        ell(d, pts[-1][0], pts[-1][1], 15, 15, skin, INK, 3)
    # kafa
    hx, hy = x + 6 * look, top - 62
    if scared: hy -= 10
    ell(d, hx - 62, hy + 5, 14, 20, skin, INK, 3); ell(d, hx + 62, hy + 5, 14, 20, skin, INK, 3)
    ell(d, hx, hy, 64, 70, skin, INK, 3)
    if kind == "landlord":
        # kel + yan saçlar, bıyık
        d.chord([P(hx - 66), P(hy - 30), P(hx - 40), P(hy + 30)], 90, 270, fill=(110, 110, 110))
        d.chord([P(hx + 40), P(hy - 30), P(hx + 66), P(hy + 30)], 270, 90, fill=(110, 110, 110))
        line(d, [(hx - 30, hy - 55), (hx - 10, hy - 62)], (255, 240, 225), 4)  # parlama
        brow = -6 if not scared else -22
        line(d, [(hx - 38, hy - 18 + brow + 8), (hx - 10, hy - 14 + brow)], INK, 5)
        line(d, [(hx + 10, hy - 14 + brow), (hx + 38, hy - 18 + brow + 8)], INK, 5)
    else:
        # saç + kasket, iri burun
        d.chord([P(hx - 66), P(hy - 74), P(hx + 66), P(hy + 20)], 180, 360, fill=(35, 30, 30), outline=INK, width=P(3))
        d.chord([P(hx - 70), P(hy - 95), P(hx + 70), P(hy - 5)], 180, 360, fill=(90, 85, 80), outline=INK, width=P(3))
        d.rounded_rectangle([P(hx - 20 + 30 * look), P(hy - 52), P(hx + 50 * look + 40), P(hy - 40)], radius=P(6), fill=(70, 65, 60), outline=INK, width=P(2)) if look > 0 else \
            d.rounded_rectangle([P(hx - 90), P(hy - 52), P(hx - 10), P(hy - 40)], radius=P(6), fill=(70, 65, 60), outline=INK, width=P(2))
        line(d, [(hx - 36, hy - 22), (hx - 12, hy - 26)], INK, 6); line(d, [(hx + 12, hy - 26), (hx + 36, hy - 22)], INK, 6)
    # gözler
    er = 16 if scared else 11
    for side in (-1, 1):
        ell(d, hx + side * 24, hy - 4, er, er + 2, (255, 255, 255), INK, 3)
        ell(d, hx + side * 24 + 4 * look, hy - 2, 5 if scared else 6, 5 if scared else 6, INK, None)
    # burun
    if kind == "temel":
        ell(d, hx + 8 * look, hy + 18, 20, 26, (220, 160, 125), INK, 3)
    else:
        ell(d, hx + 4 * look, hy + 14, 13, 13, (225, 170, 140), INK, 3)
    # ağız
    my = hy + 42
    if mouth_o or scared:
        ell(d, hx, my + 4, 16, 22, (120, 20, 30), INK, 3)
    elif talk:
        o = abs(math.sin(t * 22)) * 14 + 3
        ell(d, hx, my, 18, o, (120, 20, 30), INK, 3)
    else:
        d.arc([P(hx - 20), P(my - 14), P(hx + 20), P(my + 8)], 20, 160, fill=INK, width=P(4))
    if kind == "landlord":
        d.chord([P(hx - 38), P(my - 30), P(hx + 38), P(my - 2)], 180, 360, fill=(70, 60, 55))
        d.polygon([(P(hx - 38), P(my - 16)), (P(hx + 38), P(my - 16)), (P(hx + 30), P(my - 6)), (P(hx - 30), P(my - 6))], fill=(70, 60, 55))
    else:
        for i in range(14):  # sakal gölgesi
            rx = hx + (i * 37 % 60) - 30; ry = hy + 40 + (i * 23 % 24)
            ell(d, rx, ry, 1.5, 1.5, (120, 95, 80), None)

def jar(d, x, y, w, h, fill_n, t, lid=True, upside=False, seed=1):
    """Cam kavanoz; fill_n kadar böcek içeride."""
    rng = random.Random(seed)
    top, bot = (y, y + h) if not upside else (y, y + h)
    # içerik
    for i in range(int(fill_n)):
        bx = x - w / 2 + 14 + rng.random() * (w - 28)
        level = 1 - clamp(i / 60) * 0.95
        by = y + 30 + (h - 50) * (0.25 + rng.random() * 0.75) if fill_n > 0 else 0
        by = max(by, y + h - (h - 40) * clamp(fill_n / 40) * (0.2 + rng.random()))
        roach(d, bx, min(by, y + h - 12), rng.random() * 6.28, 9, t, rng.random() * 9)
    # cam
    glass = Image.new("RGBA", (1, 1))
    d.rounded_rectangle([P(x - w / 2), P(y), P(x + w / 2), P(y + h)], radius=P(28), outline=(70, 110, 130), width=P(5))
    line(d, [(x - w / 2 + 18, y + 30), (x - w / 2 + 18, y + h - 40)], (235, 250, 255), 6)
    if lid:
        lidy = y - 18 if not upside else y + h - 4
        d.rounded_rectangle([P(x - w / 2 - 6), P(lidy), P(x + w / 2 + 6), P(lidy + 22)], radius=P(6), fill=(200, 60, 50), outline=INK, width=P(3))

def bubble(d, x, y, w, text, tail, sz=34, color=(255, 255, 255), tcol=INK, prog=1.0):
    """Konuşma balonu; tail=(tx,ty) kuyruk ucu."""
    if prog <= 0: return
    f = font(sz)
    words = text.split(); lines = []; cur = ""
    for wd in words:
        tst = (cur + " " + wd).strip()
        if d.textlength(tst, font=f) / S > w - 40 and cur:
            lines.append(cur); cur = wd
        else:
            cur = tst
    lines.append(cur)
    lh = sz * 1.18; h = len(lines) * lh + 34
    sc = ease_back(prog)
    cx, cy = x, y
    bw, bh = w * sc, h * sc
    d.polygon([(P(cx - 25 * sc), P(cy + bh / 2 - 8)), (P(cx + 25 * sc), P(cy + bh / 2 - 8)), (P(tail[0]), P(tail[1]))], fill=color, outline=INK)
    d.rounded_rectangle([P(cx - bw / 2), P(cy - bh / 2), P(cx + bw / 2), P(cy + bh / 2)], radius=P(30 * sc), fill=color, outline=INK, width=P(4))
    d.polygon([(P(cx - 22 * sc), P(cy + bh / 2 - 6)), (P(cx + 22 * sc), P(cy + bh / 2 - 6)), (P(tail[0] + (cx - tail[0]) * 0.08), P(tail[1] - 8))], fill=color)
    if sc > 0.6:
        fs = font(sz * sc)
        for i, ln in enumerate(lines):
            tw = d.textlength(ln, font=fs) / S
            d.text((P(cx - tw / 2), P(cy - bh / 2 + 17 * sc + i * lh * sc)), ln, font=fs, fill=tcol)

def caption(d, text, x, y, sz, fill=(255, 255, 255), stroke=INK, sw=6, anchor="mm"):
    d.text((P(x), P(y)), text, font=font(sz), fill=fill, stroke_width=P(sw), stroke_fill=stroke, anchor=anchor)

# ---------------------------------------------------------------- arka planlar
def room_bg():
    im = Image.new("RGB", (W * S, H * S), (238, 218, 170))
    d = ImageDraw.Draw(im)
    # duvar kağıdı çizgileri
    for i in range(0, W, 60):
        d.rectangle([P(i), 0, P(i + 28), P(880)], fill=(232, 208, 158))
    # pencere
    d.rectangle([P(430), P(230), P(650), P(470)], fill=(150, 200, 235), outline=(120, 80, 50), width=P(14))
    line(d, [(540, 230), (540, 470)], (120, 80, 50), 10); line(d, [(430, 350), (650, 350)], (120, 80, 50), 10)
    # duvarda çatlak + leke (eski ev)
    line(d, [(90, 300), (120, 340), (105, 380), (140, 420)], (150, 120, 80), 3)
    ell(d, 300, 520, 45, 25, (215, 190, 140), None)
    # süpürgelik + yer
    d.rectangle([0, P(880), P(W), P(905)], fill=(130, 80, 45))
    for r in range(8):
        for c in range(8):
            col = (200, 190, 175) if (r + c) % 2 == 0 else (150, 140, 128)
            yy = 905 + r * 50
            d.rectangle([P(c * 90), P(yy), P(c * 90 + 90), P(yy + 50)], fill=col)
    return im

def floor_bg():
    im = Image.new("RGB", (W * S, H * S))
    d = ImageDraw.Draw(im)
    for r in range(12):
        for c in range(6):
            col = (205, 195, 180) if (r + c) % 2 == 0 else (155, 145, 132)
            d.rectangle([P(c * 130 - 20), P(r * 130 - 40), P(c * 130 + 110), P(r * 130 + 90)], fill=col)
    # sinemalı vinyet
    return im

ROOM = room_bg(); FLOOR = floor_bg()

# ---------------------------------------------------------------- sahneler
random.seed(7)
BG_ROACHES = [(random.uniform(30, 690), random.uniform(120, 860), random.uniform(0, 6.28), random.uniform(0.5, 1.5)) for _ in range(9)]
FLOOD = [(random.uniform(-1, 1), random.uniform(0.6, 1.8), random.random() * 9) for _ in range(160)]

def scene1(d, t):
    # duvarda gezinen böcekler
    for i, (bx, by, th, sp) in enumerate(BG_ROACHES):
        th2 = th + math.sin(t * sp + i) * 0.6
        x = (bx + math.cos(th2) * t * 40 * sp) % W; y = by + math.sin(th2) * t * 20 * sp
        roach(d, x, y, th2, 10, t, i)
    pose = "point" if t > 0.3 else "down"
    person(d, 190, 1060, "landlord", t, talk=speaking("ev", t), arms=pose, look=1)
    person(d, 540, 1060, "temel", t, look=-1)
    bubble(d, 300, 470, 470, "Evi nasıl teslim aldıysan öyle teslim edeceksin!", (220, 640), 36, prog=(t - 0.2) / 0.35)

COUNT = [(3.85, "497"), (5.15, "498"), (6.3, "499")]
def scene2(d, t):
    lt = t - 3.6
    jx, jy = 470, 840
    n_in = int(clamp(lt / 3.6) * 40) + 6
    # yerde jar'a koşan böcekler
    for i in range(12):
        st = i * 0.32
        p = (lt - st) / 0.9
        if p < 0 or p > 1: continue
        side = -1 if i % 2 else 1
        sx = jx + side * 420; sy = 980 + (i * 53 % 230)
        ex, ey = jx, jy + 150
        x = sx + (ex - sx) * ease_out(p); y = sy + (ey - sy) * p
        roach(d, x, y, math.atan2(ey - sy, ex - sx), 16, t, i)
    person(d, 250, 1110, "temel", t, talk=any(speaking(k, t) for k in ("c1", "c2", "c3")), kneel=True, arms="hold", look=1)
    jar(d, jx, jy, 170, 230, n_in, t, lid=False, seed=4)
    # yukarıda sayaç
    cur = None
    for st, txt in COUNT:
        if t >= st: cur = (st, txt)
    if cur:
        p = (t - cur[0]) / 0.25
        sz = 150 * (0.6 + 0.4 * ease_back(p))
        caption(d, cur[1], 360, 470, sz, fill=(255, 220, 60), sw=10)
        caption(d, "sayıyor...", 360, 580, 38, sw=5)

def scene3(d, t):
    lt = t - 7.6
    slam = 9.6
    if t < slam:
        hero(d, 360, 820, 2.4, t)
        # kavanoz yukarıdan iniyor
        if t > 9.1:
            p = ease_out((t - 9.1) / 0.5)
            jy = -800 + (440 + 800) * p
            jar(d, 360, jy, 420, 660, 0, t, lid=False, upside=True, seed=9)
        bubble(d, 360, 380, 520, "Beni yakalayamazsın!", (360, 520), 46, color=(255, 245, 120), prog=(t - 7.8) / 0.3)
    else:
        hero(d, 360, 820, 2.4, t, dance=False, squash=0.0)
        jar(d, 360, 440, 420, 660, 0, t, lid=False, upside=True, seed=9)
        p = (t - slam) / 0.3
        caption(d, "500!", 360, 250, 170 * (0.6 + 0.4 * ease_back(p)), fill=(255, 80, 60), sw=12)
        caption(d, "TAMAM!", 360, 1200, 70 * (0.6 + 0.4 * ease_back((t - 10.1) / 0.3)), fill=(255, 255, 255), sw=8) if t > 10.1 else None

def scene4(d, t):
    lt = t - 11.2
    # böcek seli
    fl = clamp((t - 11.6) / 2.2)
    jx, jy = 430, 1000
    for i, (dx, sp, ph) in enumerate(FLOOD[: int(20 + fl * 140)]):
        age = t - 11.6 - i * 0.012
        if age < 0: continue
        ang = -math.pi / 2 + dx * 2.6 + math.sin(age * 3 + ph) * 0.2
        r = age * 260 * sp
        x = jx + math.cos(ang) * r * 1.4; y = jy + math.sin(ang) * r * 0.9 + 60
        if -40 < x < W + 40 and -40 < y < H + 40:
            roach(d, x, y, ang, 13, t, ph)
    scared = t > 12.6
    jump = max(0, math.sin((t - 12.6) * 7)) * 70 if scared else 0
    person(d, 170, 1080 - jump, "landlord", t, scared=scared, arms="up" if scared else "down", look=1)
    # Temel kavanozu boşaltıyor
    person(d, 560, 1080, "temel", t, talk=speaking("teslim", t), arms="hold", look=-1)
    jar(d, jx, jy - 120, 120, 160, 6 if t < 11.6 else 0, t, lid=False, seed=3)
    bubble(d, 480, 360, 470, "Aldığım gibi teslim ettim abi!", (540, 620) if t < 12.75 else (540, 620), 38, prog=(t - 11.3) / 0.3)
    if scared:
        caption(d, "AAAAA!", 200, 520, 70 * (0.6 + 0.4 * ease_back((t - 12.75) / 0.3)), fill=(255, 255, 255), stroke=(200, 0, 0), sw=8)
    if t > 13.5:
        p = (t - 13.5) / 0.35
        d.rounded_rectangle([P(30), P(1130), P(690), P(1250)], radius=P(24), fill=(20, 20, 20))
        caption(d, "SÖZLEŞME", 360, 1165, 52 * (0.6 + 0.4 * ease_back(p)), fill=(255, 220, 60), sw=0)
        caption(d, "SÖZLEŞMEDİR", 360, 1220, 52 * (0.6 + 0.4 * ease_back(p)), fill=(255, 220, 60), sw=0)
    if t > 14.1:
        p = ease_back((t - 14.1) / 0.35)
        hero(d, 820 - 170 * p, 1042, 0.8, t, wink=t > 14.4, dance=False)

def render(fi):
    t = fi / FPS
    if t < 3.6: im = ROOM.copy()
    elif t < 7.6: im = ROOM.copy()
    elif t < 11.2: im = FLOOR.copy()
    else: im = ROOM.copy()
    d = ImageDraw.Draw(im)
    if t < 3.6: scene1(d, t)
    elif t < 7.6: scene2(d, t)
    elif t < 11.2: scene3(d, t)
    else: scene4(d, t)
    # üst başlık (trend formatı)
    d.rounded_rectangle([P(20), P(30), P(700), P(118)], radius=P(20), fill=(255, 255, 255), outline=INK, width=P(3))
    caption(d, "POV: Kiracı evden çıkıyor", 360, 74, 40, fill=INK, sw=0)
    im = im.resize((W, H), Image.LANCZOS)
    # kamera sarsıntısı + sahne geçiş zoom'u
    shake = 0
    for ts, amp in ((9.6, 22), (12.75, 10)):
        if ts <= t < ts + 0.4: shake = amp * (1 - (t - ts) / 0.4)
    zoom = 1.0
    for ts in (3.6, 7.6, 11.2):
        if ts <= t < ts + 0.25: zoom = 1.15 - 0.15 * ease_out((t - ts) / 0.25)
    if t < 0.25: zoom = 1.15 - 0.15 * ease_out(t / 0.25)
    if shake or zoom != 1.0:
        rx = random.uniform(-shake, shake); ry = random.uniform(-shake, shake)
        zw, zh = W / zoom, H / zoom
        x0 = (W - zw) / 2 + rx; y0 = (H - zh) / 2 + ry
        x0 = clamp(x0, 0, W - zw) if zoom > 1 else x0
        im = im.transform((W, H), Image.EXTENT, (x0, y0, x0 + zw, y0 + zh), Image.BILINEAR)
    # beyaz flaş geçişler
    for ts in (9.6,):
        if ts <= t < ts + 0.12:
            im = Image.blend(im, Image.new("RGB", (W, H), (255, 255, 255)), 0.6 * (1 - (t - ts) / 0.12))
    return im

if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1:  # önizleme kareleri
        for s in sys.argv[1:]:
            render(int(float(s) * FPS)).save(os.path.join(OUT, f"prev_{s}.png"))
        sys.exit()
    out = os.path.join(OUT, "hamambocegi_fikra.mp4")
    ff = subprocess.Popen(["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24",
                           "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-", "-i", os.path.join(OUT, "audio.wav"),
                           "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p",
                           "-c:a", "aac", "-b:a", "160k", "-shortest", "-movflags", "+faststart", out], stdin=subprocess.PIPE)
    for fi in range(NF):
        ff.stdin.write(render(fi).tobytes())
    ff.stdin.close(); ff.wait()
    print("OK", out)
