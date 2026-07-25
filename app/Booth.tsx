"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import {
  ctrlSnapHostIsReady,
  sendCtrlSnapHostEvent,
} from "./openhome";

type Stage = "welcome" | "camera" | "printing" | "filters";
type SkinId =
  | "classic"
  | "cloud"
  | "star"
  | "handycam"
  | "blackout"
  | "overdrive";

type Skin = {
  id: SkinId;
  name: string;
};

const SKINS: Skin[] = [
  { id: "classic", name: "RAW" },
  { id: "cloud", name: "CLOUD" },
  { id: "star", name: "FLASH" },
  { id: "handycam", name: "CAM" },
  { id: "blackout", name: "MONO" },
  { id: "overdrive", name: "OD" },
];

let printAudioContext: AudioContext | null = null;

function fourPointStar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  outer: number,
  inner: number,
) {
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const radius = i % 2 === 0 ? outer : inner;
    const angle = -Math.PI / 2 + (i * Math.PI) / 4;
    const px = x + Math.cos(angle) * radius;
    const py = y + Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function drawCover(
  ctx: CanvasRenderingContext2D,
  image: CanvasImageSource,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  const source = image as HTMLVideoElement | HTMLImageElement;
  const sw = "videoWidth" in source ? source.videoWidth : source.naturalWidth;
  const sh = "videoHeight" in source ? source.videoHeight : source.naturalHeight;
  const scale = Math.max(w / sw, h / sh);
  const cropW = w / scale;
  const cropH = h / scale;
  ctx.drawImage(
    image,
    (sw - cropW) / 2,
    (sh - cropH) / 2,
    cropW,
    cropH,
    x,
    y,
    w,
    h,
  );
}

function drawVignette(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  strength: number,
) {
  const gradient = ctx.createRadialGradient(
    x + w / 2,
    y + h * 0.46,
    w * 0.18,
    x + w / 2,
    y + h / 2,
    w * 0.72,
  );
  gradient.addColorStop(0, "rgba(0,0,0,0)");
  gradient.addColorStop(0.62, "rgba(0,0,0,0)");
  gradient.addColorStop(1, `rgba(0,0,0,${strength})`);
  ctx.fillStyle = gradient;
  ctx.fillRect(x, y, w, h);
}

function drawScanlines(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  spacing = 6,
  alpha = 0.1,
) {
  ctx.fillStyle = `rgba(2,8,12,${alpha})`;
  for (let lineY = y; lineY < y + h; lineY += spacing) {
    ctx.fillRect(x, lineY, w, 1.4);
  }
}

function drawLensFlare(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  color: string,
) {
  const glow = ctx.createRadialGradient(x, y, 0, x, y, radius);
  glow.addColorStop(0, "rgba(255,255,255,.98)");
  glow.addColorStop(0.08, color);
  glow.addColorStop(0.34, "rgba(147,211,245,.18)");
  glow.addColorStop(1, "rgba(147,211,245,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  ctx.fillStyle = "rgba(255,255,255,.82)";
  ctx.fillRect(x - radius * 1.2, y - 1.5, radius * 2.4, 3);
  ctx.fillRect(x - 1.5, y - radius * 0.72, 3, radius * 1.44);
}

function drawHalftone(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  step: number,
  color: string,
  alpha: number,
) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.globalAlpha = alpha;
  for (let row = 0; row < height / step; row++) {
    for (let column = 0; column < width / step; column++) {
      const pulse = 0.35 + Math.abs(Math.sin(row * 0.71 + column * 0.47)) * 0.65;
      const radius = step * 0.16 * pulse;
      ctx.beginPath();
      ctx.arc(
        x + column * step + (row % 2) * (step / 2),
        y + row * step,
        radius,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
  }
  ctx.restore();
}

function drawSprayCloud(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  color: string,
  density = 150,
) {
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  ctx.fillStyle = color;
  ctx.filter = `blur(${Math.max(5, radius * 0.055)}px)`;
  for (let index = 0; index < 24; index++) {
    const angle = Math.random() * Math.PI * 2;
    const distance = Math.sqrt(Math.random()) * radius * 0.58;
    const blob = radius * (0.11 + Math.random() * 0.17);
    ctx.globalAlpha = 0.12 + Math.random() * 0.2;
    ctx.beginPath();
    ctx.arc(
      x + Math.cos(angle) * distance,
      y + Math.sin(angle) * distance,
      blob,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
  ctx.filter = "none";
  for (let index = 0; index < density; index++) {
    const angle = Math.random() * Math.PI * 2;
    const distance = Math.sqrt(Math.random()) * radius;
    const dot = 0.6 + Math.random() * 3.8;
    ctx.globalAlpha = Math.max(0.04, 0.34 * (1 - distance / radius));
    ctx.fillRect(
      x + Math.cos(angle) * distance,
      y + Math.sin(angle) * distance,
      dot,
      dot,
    );
  }
  ctx.restore();
}

function drawChromeBurst(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  outer: number,
  inner: number,
  rotation = 0,
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  const chrome = ctx.createLinearGradient(-outer, -outer, outer, outer);
  chrome.addColorStop(0, "#202428");
  chrome.addColorStop(0.22, "#f7fbff");
  chrome.addColorStop(0.43, "#717b84");
  chrome.addColorStop(0.63, "#ffffff");
  chrome.addColorStop(0.82, "#4d555c");
  chrome.addColorStop(1, "#d9e8ef");
  fourPointStar(ctx, 0, 0, outer, inner);
  ctx.fillStyle = chrome;
  ctx.fill();
  ctx.strokeStyle = "rgba(7,9,11,.96)";
  ctx.lineWidth = Math.max(2, outer * 0.055);
  ctx.stroke();
  fourPointStar(ctx, 0, 0, outer * 0.78, inner * 0.7);
  ctx.strokeStyle = "rgba(255,255,255,.78)";
  ctx.lineWidth = Math.max(1.5, outer * 0.02);
  ctx.stroke();
  ctx.restore();
}

function drawGlitchSlices(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  count: number,
) {
  ctx.save();
  for (let index = 0; index < count; index++) {
    const sliceY = y + Math.random() * height;
    const sliceH = 5 + Math.random() * 22;
    const offset = (Math.random() - 0.5) * 34;
    ctx.globalAlpha = 0.18 + Math.random() * 0.2;
    ctx.drawImage(
      ctx.canvas,
      x,
      sliceY,
      width,
      sliceH,
      x + offset,
      sliceY,
      width,
      sliceH,
    );
  }
  ctx.restore();
}

async function renderPrint(photo: string, skin: SkinId): Promise<string> {
  const image = new Image();
  const labTexture = new Image();
  const snappyLogo = new Image();
  image.src = photo;
  labTexture.src = "/assets/y2k-print-lab-texture.png";
  snappyLogo.src = "/assets/snappy-logo.png";
  await Promise.all([
    image.decode(),
    labTexture.decode(),
    snappyLogo.decode(),
    document.fonts.load("700 88px 'Caveat Variable'"),
    document.fonts.load("650 22px 'Azeret Mono Variable'"),
  ]);

  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 1500;
  const ctx = canvas.getContext("2d")!;
  const photoX = 90;
  const photoY = 90;
  const photoW = 1020;
  const photoH = 1080;

  const paper =
    skin === "blackout"
      ? "#050505"
      : skin === "cloud"
        ? "#c7d8e6"
        : "#e9e9e5";
  ctx.fillStyle = paper;
  ctx.fillRect(0, 0, 1200, 1500);

  if (skin === "cloud" || skin === "star" || skin === "overdrive") {
    ctx.save();
    ctx.globalAlpha = skin === "overdrive" ? 0.86 : 0.6;
    ctx.globalCompositeOperation = skin === "star" ? "screen" : "source-over";
    drawCover(ctx, labTexture, 0, 0, 1200, 1500);
    ctx.restore();
  }

  if (skin === "cloud" || skin === "overdrive") {
    const cloud = ctx.createRadialGradient(260, 1300, 20, 260, 1300, 620);
    cloud.addColorStop(0, "rgba(235,248,255,.95)");
    cloud.addColorStop(0.45, "rgba(133,174,205,.55)");
    cloud.addColorStop(1, "rgba(133,174,205,0)");
    ctx.fillStyle = cloud;
    ctx.fillRect(0, 0, 1200, 1500);
  }

  ctx.save();
  if (skin === "blackout") ctx.filter = "grayscale(1) contrast(1.68) brightness(.9)";
  else if (skin === "cloud") ctx.filter = "saturate(.52) contrast(.84) brightness(1.16) blur(.55px)";
  else if (skin === "star") ctx.filter = "contrast(1.16) saturate(1.08)";
  else if (skin === "handycam") ctx.filter = "saturate(.62) contrast(1.24) sepia(.1)";
  else if (skin === "overdrive") ctx.filter = "contrast(1.2) saturate(1.12)";
  else ctx.filter = "contrast(1.08) saturate(.92)";
  drawCover(ctx, image, photoX, photoY, photoW, photoH);
  ctx.restore();

  const chrome = ctx.createLinearGradient(0, 1180, 0, 1500);
  chrome.addColorStop(0, "#fafafa");
  chrome.addColorStop(0.28, "#8d969e");
  chrome.addColorStop(0.48, "#ffffff");
  chrome.addColorStop(0.72, "#5d6267");
  chrome.addColorStop(1, "#d8d8d8");

  ctx.save();
  ctx.beginPath();
  ctx.rect(photoX, photoY, photoW, photoH);
  ctx.clip();

  if (skin === "classic") {
    const flash = ctx.createLinearGradient(photoX, photoY, photoX + photoW, photoY + photoH);
    flash.addColorStop(0, "rgba(255,255,255,.14)");
    flash.addColorStop(0.28, "rgba(255,255,255,0)");
    flash.addColorStop(0.72, "rgba(151,208,238,0)");
    flash.addColorStop(1, "rgba(151,208,238,.11)");
    ctx.fillStyle = flash;
    ctx.fillRect(photoX, photoY, photoW, photoH);
    drawVignette(ctx, photoX, photoY, photoW, photoH, 0.3);
    const silverLeak = ctx.createLinearGradient(photoX, 0, photoX + photoW, 0);
    silverLeak.addColorStop(0, "rgba(230,247,255,.42)");
    silverLeak.addColorStop(0.08, "rgba(230,247,255,.05)");
    silverLeak.addColorStop(0.72, "rgba(255,255,255,0)");
    silverLeak.addColorStop(1, "rgba(145,201,232,.24)");
    ctx.fillStyle = silverLeak;
    ctx.fillRect(photoX, photoY, photoW, photoH);
    drawHalftone(ctx, photoX, photoY, photoW, photoH, 18, "#eaf7ff", 0.08);
  }

  if (skin === "cloud" || skin === "overdrive") {
    ctx.globalCompositeOperation = "screen";
    ctx.globalAlpha = skin === "overdrive" ? 0.28 : 0.42;
    ctx.filter = "blur(13px) saturate(.7)";
    drawCover(ctx, labTexture, photoX - 20, photoY - 10, photoW + 40, photoH + 20);
    ctx.filter = "none";
    ctx.globalAlpha = 1;
    const mistOne = ctx.createRadialGradient(
      photoX + 170,
      photoY + 160,
      10,
      photoX + 170,
      photoY + 160,
      430,
    );
    mistOne.addColorStop(0, "rgba(226,247,255,.66)");
    mistOne.addColorStop(1, "rgba(154,203,232,0)");
    ctx.fillStyle = mistOne;
    ctx.fillRect(photoX, photoY, photoW, photoH);
    const mistTwo = ctx.createRadialGradient(
      photoX + 900,
      photoY + 850,
      0,
      photoX + 900,
      photoY + 850,
      420,
    );
    mistTwo.addColorStop(0, "rgba(190,225,244,.42)");
    mistTwo.addColorStop(1, "rgba(190,225,244,0)");
    ctx.fillStyle = mistTwo;
    ctx.fillRect(photoX, photoY, photoW, photoH);
    ctx.globalCompositeOperation = "source-over";
    drawSprayCloud(
      ctx,
      photoX + 90,
      photoY + photoH * 0.72,
      310,
      "rgba(42,84,206,.82)",
      230,
    );
    drawSprayCloud(
      ctx,
      photoX + photoW - 70,
      photoY + 190,
      280,
      "rgba(236,250,255,.92)",
      180,
    );
    drawHalftone(ctx, photoX, photoY, photoW, photoH, 15, "#2146a8", 0.14);
  }

  if (skin === "star" || skin === "overdrive") {
    ctx.globalCompositeOperation = "screen";
    drawLensFlare(
      ctx,
      photoX + photoW * 0.78,
      photoY + photoH * 0.24,
      skin === "overdrive" ? 190 : 230,
      "rgba(213,241,255,.72)",
    );
    drawLensFlare(
      ctx,
      photoX + photoW * 0.18,
      photoY + photoH * 0.76,
      92,
      "rgba(255,221,247,.55)",
    );
    ctx.fillStyle = "rgba(255,255,255,.92)";
    [0.16, 0.43, 0.68, 0.88].forEach((fraction, index) => {
      fourPointStar(
        ctx,
        photoX + photoW * fraction,
        photoY + photoH * (0.18 + ((index * 0.23) % 0.64)),
        28 + index * 7,
        5 + index,
      );
      ctx.fill();
    });
    ctx.globalCompositeOperation = "source-over";
    drawChromeBurst(
      ctx,
      photoX + photoW * 0.84,
      photoY + photoH * 0.22,
      skin === "overdrive" ? 108 : 154,
      skin === "overdrive" ? 20 : 27,
      -0.12,
    );
    drawChromeBurst(
      ctx,
      photoX + photoW * 0.15,
      photoY + photoH * 0.8,
      skin === "overdrive" ? 62 : 92,
      skin === "overdrive" ? 13 : 18,
      0.2,
    );
  }

  if (skin === "handycam" || skin === "overdrive") {
    ctx.globalCompositeOperation = "screen";
    ctx.globalAlpha = skin === "overdrive" ? 0.1 : 0.16;
    ctx.filter = "sepia(1) saturate(7) hue-rotate(300deg)";
    drawCover(ctx, image, photoX - 7, photoY, photoW, photoH);
    ctx.filter = "sepia(1) saturate(7) hue-rotate(155deg)";
    drawCover(ctx, image, photoX + 7, photoY, photoW, photoH);
    ctx.filter = "none";
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    drawScanlines(
      ctx,
      photoX,
      photoY,
      photoW,
      photoH,
      skin === "overdrive" ? 9 : 6,
      skin === "overdrive" ? 0.08 : 0.14,
    );
    drawGlitchSlices(
      ctx,
      photoX,
      photoY,
      photoW,
      photoH,
      skin === "overdrive" ? 8 : 15,
    );
  }

  if (skin === "blackout") {
    const burn = ctx.createLinearGradient(
      photoX,
      photoY,
      photoX + photoW,
      photoY + photoH,
    );
    burn.addColorStop(0, "rgba(255,255,255,.17)");
    burn.addColorStop(0.22, "rgba(255,255,255,0)");
    burn.addColorStop(0.72, "rgba(0,0,0,.08)");
    burn.addColorStop(1, "rgba(0,0,0,.62)");
    ctx.fillStyle = burn;
    ctx.fillRect(photoX, photoY, photoW, photoH);
    drawVignette(ctx, photoX, photoY, photoW, photoH, 0.74);
    ctx.fillStyle = "rgba(255,255,255,.34)";
    for (let index = 0; index < 460; index++) {
      const radius = Math.random() > 0.94 ? 2.2 : 0.8;
      ctx.fillRect(
        photoX + Math.random() * photoW,
        photoY + Math.random() * photoH,
        radius,
        radius,
      );
    }
    drawHalftone(ctx, photoX, photoY, photoW, photoH, 13, "#ffffff", 0.27);
    drawGlitchSlices(ctx, photoX, photoY, photoW, photoH, 18);
    ctx.save();
    ctx.globalCompositeOperation = "difference";
    ctx.fillStyle = "#fff";
    ctx.translate(photoX + photoW * 0.76, photoY + photoH * 0.78);
    ctx.rotate(-0.08);
    fourPointStar(ctx, 0, 0, 132, 34);
    ctx.fill();
    ctx.restore();
  }

  if (skin === "overdrive") {
    ctx.strokeStyle = "rgba(201,235,250,.3)";
    ctx.lineWidth = 3;
    for (let index = 0; index < 11; index++) {
      const y = photoY + 120 + index * 82;
      ctx.beginPath();
      ctx.moveTo(photoX - 20, y);
      ctx.lineTo(photoX + 160 + index * 21, y - 38);
      ctx.stroke();
    }
    drawSprayCloud(
      ctx,
      photoX + photoW * 0.18,
      photoY + photoH * 0.78,
      360,
      "rgba(39,73,198,.78)",
      280,
    );
    drawSprayCloud(
      ctx,
      photoX + photoW * 0.78,
      photoY + photoH * 0.18,
      250,
      "rgba(238,251,255,.9)",
      160,
    );
    drawHalftone(ctx, photoX, photoY, photoW, photoH, 14, "#173b9d", 0.14);
    drawVignette(ctx, photoX, photoY, photoW, photoH, 0.44);
  }

  ctx.restore();

  ctx.save();
  ctx.strokeStyle = skin === "blackout" ? chrome : "rgba(255,255,255,.72)";
  ctx.lineWidth = skin === "blackout" ? 10 : 5;
  ctx.strokeRect(photoX + 2.5, photoY + 2.5, photoW - 5, photoH - 5);
  ctx.restore();

  if (skin === "classic") {
    ctx.save();
    ctx.strokeStyle = "rgba(210,232,243,.72)";
    ctx.lineWidth = 2;
    ctx.strokeRect(photoX + 20, photoY + 20, photoW - 40, photoH - 40);
    ctx.strokeStyle = "rgba(25,29,32,.36)";
    ctx.strokeRect(photoX + 27, photoY + 27, photoW - 54, photoH - 54);
    ctx.restore();
  }

  if (skin === "star" || skin === "overdrive") {
    ctx.save();
    ctx.fillStyle = chrome;
    ctx.strokeStyle = "#30353a";
    ctx.lineWidth = 4;
    fourPointStar(ctx, 1040, 1285, 82, 16);
    ctx.fill();
    ctx.stroke();
    fourPointStar(ctx, 918, 1328, 38, 8);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  if (skin === "handycam" || skin === "overdrive") {
    ctx.font = "600 28px 'Azeret Mono Variable'";
    ctx.fillStyle = "#fff";
    ctx.textAlign = "left";
    ctx.fillText("● REC", 126, 150);
    ctx.textAlign = "right";
    ctx.fillText(new Date().toLocaleDateString("en-US"), 1065, 150);
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 7;
    const corner = (x: number, y: number, sx: number, sy: number) => {
      ctx.beginPath();
      ctx.moveTo(x + sx * 82, y);
      ctx.lineTo(x, y);
      ctx.lineTo(x, y + sy * 82);
      ctx.stroke();
    };
    corner(125, 125, 1, 1);
    corner(1075, 125, -1, 1);
    corner(125, 1135, 1, -1);
    corner(1075, 1135, -1, -1);
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 4;
    ctx.strokeRect(956, 166, 88, 36);
    ctx.fillStyle = "#fff";
    ctx.fillRect(1044, 176, 8, 16);
    ctx.fillStyle = skin === "overdrive" ? "#b9ff4c" : "#fff";
    ctx.fillRect(965, 175, skin === "overdrive" ? 64 : 48, 18);
  }

  if (skin === "overdrive") {
    ctx.save();
    ctx.fillStyle = "#b9ff4c";
    ctx.strokeStyle = "#121417";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.roundRect(760, 1080, 260, 48, 24);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#111";
    for (let index = 0; index < 3; index++) {
      ctx.save();
      ctx.translate(792 + index * 66, 1104);
      ctx.rotate(-0.08);
      ctx.fillRect(-25, -6, 50, 12);
      ctx.restore();
    }
    ctx.restore();
  }

  if (skin === "blackout") {
    ctx.strokeStyle = chrome;
    ctx.lineWidth = 16;
    ctx.strokeRect(34, 34, 1132, 1432);
  }

  const footerInk = skin === "blackout" ? "#f2f2ed" : "#111315";
  const date = new Date().toLocaleDateString("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  });
  ctx.fillStyle = footerInk;
  ctx.textAlign = "left";
  ctx.font = "700 76px 'Caveat Variable'";
  ctx.fillText("CTRL OVERDRIVE", 78, 1308);
  ctx.font = "700 88px 'Caveat Variable'";
  ctx.fillText(date, 78, 1450);
  ctx.font = "650 22px 'Azeret Mono Variable'";
  ctx.letterSpacing = "2.5px";
  ctx.fillText("POWERED BY", 668, 1435);
  ctx.letterSpacing = "0px";

  ctx.drawImage(
    snappyLogo,
    210,
    500,
    1600,
    820,
    900,
    1358,
    230,
    94,
  );

  for (let i = 0; i < 14000; i++) {
    const value = Math.random() > 0.5 ? 255 : 0;
    ctx.fillStyle = `rgba(${value},${value},${value},${Math.random() * 0.05})`;
    ctx.fillRect(Math.random() * 1200, Math.random() * 1500, 1.5, 1.5);
  }

  return canvas.toDataURL("image/jpeg", 0.9);
}

function preparePrintSound() {
  const AudioContextClass = window.AudioContext;
  if (!AudioContextClass) return null;
  if (!printAudioContext || printAudioContext.state === "closed") {
    printAudioContext = new AudioContextClass();
  }
  if (printAudioContext.state === "suspended") {
    void printAudioContext.resume();
  }
  return printAudioContext;
}

async function playPrintSound() {
  const audio = preparePrintSound();
  if (!audio) return;
  if (audio.state === "suspended") await audio.resume();
  const now = audio.currentTime + 0.035;
  const master = audio.createGain();
  master.gain.setValueAtTime(0.0001, now);
  master.gain.exponentialRampToValueAtTime(0.24, now + 0.035);
  master.gain.setValueAtTime(0.24, now + 4.85);
  master.gain.exponentialRampToValueAtTime(0.0001, now + 5.8);
  master.connect(audio.destination);

  const motorBus = audio.createGain();
  const motorFilter = audio.createBiquadFilter();
  motorBus.gain.setValueAtTime(0.12, now);
  motorBus.gain.linearRampToValueAtTime(0.25, now + 0.28);
  motorBus.gain.setValueAtTime(0.25, now + 3.9);
  motorBus.gain.exponentialRampToValueAtTime(0.0001, now + 4.9);
  motorFilter.type = "lowpass";
  motorFilter.frequency.setValueAtTime(520, now);
  motorFilter.frequency.linearRampToValueAtTime(980, now + 2.6);
  motorFilter.frequency.linearRampToValueAtTime(360, now + 4.7);
  motorBus.connect(motorFilter).connect(master);

  const motorLow = audio.createOscillator();
  motorLow.type = "sawtooth";
  motorLow.frequency.setValueAtTime(46, now);
  motorLow.frequency.linearRampToValueAtTime(72, now + 2.7);
  motorLow.frequency.linearRampToValueAtTime(38, now + 4.75);
  motorLow.connect(motorBus);
  motorLow.start(now);
  motorLow.stop(now + 4.9);

  const stepper = audio.createOscillator();
  const stepperGain = audio.createGain();
  const stepperPulse = audio.createOscillator();
  const stepperDepth = audio.createGain();
  stepper.type = "square";
  stepper.frequency.setValueAtTime(118, now);
  stepper.frequency.linearRampToValueAtTime(176, now + 2.5);
  stepper.frequency.linearRampToValueAtTime(92, now + 4.6);
  stepperGain.gain.value = 0.08;
  stepperPulse.type = "square";
  stepperPulse.frequency.setValueAtTime(13, now);
  stepperDepth.gain.value = 0.065;
  stepperPulse.connect(stepperDepth).connect(stepperGain.gain);
  stepper.connect(stepperGain).connect(motorBus);
  stepper.start(now);
  stepperPulse.start(now);
  stepper.stop(now + 4.75);
  stepperPulse.stop(now + 4.75);

  const buffer = audio.createBuffer(1, audio.sampleRate * 5.35, audio.sampleRate);
  const channel = buffer.getChannelData(0);
  for (let i = 0; i < channel.length; i++) {
    const rhythm = 0.42 + Math.pow(Math.sin(i * 0.0027), 10) * 0.38;
    channel[i] = (Math.random() * 2 - 1) * rhythm;
  }
  const paper = audio.createBufferSource();
  const paperFilter = audio.createBiquadFilter();
  const paperGain = audio.createGain();
  paper.buffer = buffer;
  paperFilter.type = "bandpass";
  paperFilter.frequency.setValueAtTime(1100, now);
  paperFilter.frequency.linearRampToValueAtTime(2500, now + 3.8);
  paperFilter.Q.value = 0.62;
  paperGain.gain.setValueAtTime(0.025, now);
  paperGain.gain.linearRampToValueAtTime(0.2, now + 2.9);
  paperGain.gain.setValueAtTime(0.2, now + 4.2);
  paperGain.gain.exponentialRampToValueAtTime(0.0001, now + 5.15);
  paper.connect(paperFilter).connect(paperGain).connect(master);
  paper.start(now);
  paper.stop(now + 5.3);

  [0.06, 0.18, 0.3, 0.42, 0.54, 4.38].forEach((offset, index) => {
    const click = audio.createOscillator();
    const gain = audio.createGain();
    const finish = index === 5;
    click.type = finish ? "triangle" : "square";
    click.frequency.setValueAtTime(finish ? 740 : 170 + index * 29, now + offset);
    click.frequency.exponentialRampToValueAtTime(
      finish ? 1480 : 68,
      now + offset + (finish ? 0.24 : 0.1),
    );
    gain.gain.setValueAtTime(finish ? 0.22 : 0.13, now + offset);
    gain.gain.exponentialRampToValueAtTime(
      0.0001,
      now + offset + (finish ? 0.42 : 0.14),
    );
    click.connect(gain).connect(master);
    click.start(now + offset);
    click.stop(now + offset + (finish ? 0.44 : 0.15));
  });

  [4.52, 4.7].forEach((offset, index) => {
    const chime = audio.createOscillator();
    const chimeGain = audio.createGain();
    chime.type = "sine";
    chime.frequency.value = index === 0 ? 1110 : 1665;
    chimeGain.gain.setValueAtTime(0.0001, now + offset);
    chimeGain.gain.exponentialRampToValueAtTime(0.13, now + offset + 0.018);
    chimeGain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.72);
    chime.connect(chimeGain).connect(master);
    chime.start(now + offset);
    chime.stop(now + offset + 0.74);
  });
}

function ChromeStar({ className = "" }: { className?: string }) {
  return <span className={`chrome-star ${className}`} aria-hidden="true" />;
}

function Progress({ stage }: { stage: Stage }) {
  const step = stage === "welcome" ? 0 : stage === "camera" ? 1 : stage === "printing" ? 2 : 3;
  return (
    <div className="progress" aria-label={`Step ${Math.max(1, step)} of 3`}>
      {[1, 2, 3].map((item) => (
        <span key={item} className={step >= item ? "active" : ""} />
      ))}
    </div>
  );
}

function PrinterScene({
  image,
  onComplete,
}: {
  image: string;
  onComplete: () => void;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const completed = useRef(false);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
    camera.position.set(0, 2.35, 10.4);
    camera.lookAt(0, 0.05, 0.45);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.18;
    mount.appendChild(renderer.domElement);

    const printer = new THREE.Group();
    printer.rotation.y = -0.06;
    printer.position.y = 0.05;
    scene.add(printer);

    const materials: THREE.Material[] = [];
    const material = (options: THREE.MeshPhysicalMaterialParameters) => {
      const next = new THREE.MeshPhysicalMaterial(options);
      materials.push(next);
      return next;
    };
    const shellMaterial = material({
      color: 0x121416,
      roughness: 0.28,
      metalness: 0.72,
      clearcoat: 0.62,
      clearcoatRoughness: 0.2,
    });
    const lidMaterial = material({
      color: 0x252a2e,
      roughness: 0.2,
      metalness: 0.82,
      clearcoat: 0.85,
    });
    const chromeMaterial = material({
      color: 0xcbd5dc,
      roughness: 0.12,
      metalness: 1,
      clearcoat: 1,
    });
    const rubberMaterial = material({
      color: 0x020303,
      roughness: 0.78,
      metalness: 0.06,
    });

    const addMesh = (
      geometry: THREE.BufferGeometry,
      meshMaterial: THREE.Material,
      position: [number, number, number],
      rotation: [number, number, number] = [0, 0, 0],
    ) => {
      const mesh = new THREE.Mesh(geometry, meshMaterial);
      mesh.position.set(...position);
      mesh.rotation.set(...rotation);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      printer.add(mesh);
      return mesh;
    };

    addMesh(
      new RoundedBoxGeometry(5.9, 2.65, 3.65, 10, 0.3),
      shellMaterial,
      [0, -0.75, -0.3],
    );
    const lid = addMesh(
      new RoundedBoxGeometry(5.48, 0.9, 3.18, 10, 0.24),
      lidMaterial,
      [0, 0.77, -0.47],
      [-0.055, 0, 0],
    );
    addMesh(
      new RoundedBoxGeometry(5.12, 0.64, 0.72, 8, 0.15),
      shellMaterial,
      [0, 0.34, 1.34],
      [-0.035, 0, 0],
    );
    addMesh(new THREE.BoxGeometry(4.45, 0.13, 0.25), rubberMaterial, [0, 0.43, 1.72]);
    addMesh(new THREE.BoxGeometry(4.58, 0.07, 0.12), chromeMaterial, [0, 0.55, 1.81]);
    addMesh(new THREE.BoxGeometry(5.18, 0.035, 2.58), chromeMaterial, [0, 1.2, -0.43]);

    const rollerGeometry = new THREE.CylinderGeometry(0.115, 0.115, 4.15, 28);
    const frontRoller = addMesh(
      rollerGeometry,
      rubberMaterial,
      [0, 0.39, 1.58],
      [0, 0, Math.PI / 2],
    );
    const rearRoller = addMesh(
      rollerGeometry,
      chromeMaterial,
      [0, 0.52, 1.37],
      [0, 0, Math.PI / 2],
    );

    const powerLight = addMesh(
      new THREE.SphereGeometry(0.075, 24, 16),
      material({
        color: 0xa8e4ff,
        emissive: 0x55bce9,
        emissiveIntensity: 6,
        roughness: 0.1,
      }),
      [2.22, -0.38, 1.53],
    );
    addMesh(
      new THREE.CylinderGeometry(0.19, 0.19, 0.05, 36),
      chromeMaterial,
      [1.72, -0.4, 1.54],
      [Math.PI / 2, 0, 0],
    );

    for (let index = 0; index < 7; index++) {
      addMesh(
        new THREE.BoxGeometry(0.055, 0.62, 1.15),
        rubberMaterial,
        [-2.97, -0.7 + index * 0.15, -0.35],
      );
    }

    const texture = new THREE.TextureLoader().load(image);
    texture.colorSpace = THREE.SRGBColorSpace;
    const photoMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uTexture: { value: texture },
        uProgress: { value: 0 },
        uTime: { value: 0 },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D uTexture;
        uniform float uProgress;
        uniform float uTime;
        varying vec2 vUv;

        float hash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
        }

        void main() {
          vec2 uv = vUv;
          float jitter = (hash(vec2(floor(uv.y * 460.0), floor(uTime * 24.0))) - .5) * .004;
          float aberration = .009 * (1.0 - uProgress);
          vec3 color;
          color.r = texture2D(uTexture, uv + vec2(aberration + jitter, 0.0)).r;
          color.g = texture2D(uTexture, uv + vec2(jitter, 0.0)).g;
          color.b = texture2D(uTexture, uv - vec2(aberration - jitter, 0.0)).b;

          float grain = hash(uv * vec2(993.4, 717.2) + uTime);
          float chemistry = uv.y * .72 + hash(floor(uv * 34.0)) * .18 + distance(uv, vec2(.5)) * .18;
          float reveal = smoothstep(chemistry - .11, chemistry + .08, uProgress * 1.05);
          float mono = dot(color, vec3(.299, .587, .114));
          vec3 undeveloped = vec3(.78, .82, .77) + (grain - .5) * .08;
          vec3 ghost = mix(vec3(mono) * vec3(.76, .86, .92), color, uProgress * .65);
          vec3 developed = mix(ghost, color, smoothstep(.35, .92, uProgress));
          vec3 result = mix(undeveloped, developed, reveal);

          float scan = sin(uv.y * 900.0 + uTime * 8.0) * .018;
          float sweep = 1.0 - smoothstep(.0, .08, abs(uv.y - (1.18 - uProgress * 1.35)));
          result += scan + sweep * vec3(.42, .58, .72);
          result += (grain - .5) * (.1 - uProgress * .06);
          gl_FragColor = vec4(result, 1.0);
        }
      `,
    });

    const card = new THREE.Group();
    card.position.set(0, 0.58, -0.3);
    card.rotation.x = -Math.PI / 2;
    scene.add(card);
    const cardBack = new THREE.Mesh(
      new RoundedBoxGeometry(3.24, 4.04, 0.075, 5, 0.045),
      material({
        color: 0xf1f0e8,
        roughness: 0.36,
        metalness: 0.02,
        clearcoat: 0.24,
      }),
    );
    cardBack.castShadow = true;
    card.add(cardBack);
    const photo = new THREE.Mesh(new THREE.PlaneGeometry(3.16, 3.96), photoMaterial);
    photo.position.z = 0.041;
    card.add(photo);

    const slotGlow = new THREE.PointLight(0x9dd8ff, 22, 6.5);
    slotGlow.position.set(0, 0.58, 2.05);
    scene.add(slotGlow);
    const key = new THREE.DirectionalLight(0xffffff, 5.8);
    key.position.set(-4, 6, 7);
    key.castShadow = true;
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x78bfff, 6.5);
    rim.position.set(5, 3, 2);
    scene.add(rim);
    scene.add(new THREE.AmbientLight(0x8b93a0, 2.2));

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(30, 30),
      material({ color: 0x030404, roughness: 0.82, metalness: 0.15 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -2.13;
    floor.receiveShadow = true;
    scene.add(floor);

    const resize = () => {
      const width = mount.clientWidth;
      const height = mount.clientHeight;
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(mount);

    const start = performance.now();
    let frame = 0;
    const animate = (now: number) => {
      const t = Math.min((now - start) / 6400, 1);
      const feedT = Math.min(t / 0.68, 1);
      const feed = 1 - Math.pow(1 - feedT, 3);
      const liftT = Math.max(0, Math.min((t - 0.67) / 0.3, 1));
      const lift = liftT * liftT * (3 - 2 * liftT);

      card.position.z = -0.28 + feed * 4.05 - lift * 0.55;
      card.position.y = 0.58 + Math.sin(feed * Math.PI) * 0.11 - lift * 0.74;
      card.rotation.x = -Math.PI / 2 + lift * 1.49;
      card.rotation.y = lift * -0.045;
      card.rotation.z = lift * -0.055;
      printer.position.x = feedT < 0.95 ? Math.sin(t * 260) * 0.008 : 0;
      lid.rotation.x = -0.055 + Math.sin(Math.min(feedT, 1) * Math.PI) * 0.018;
      frontRoller.rotation.y -= 0.25;
      rearRoller.rotation.y += 0.22;
      powerLight.scale.setScalar(1 + Math.sin(t * 45) * 0.08);
      photoMaterial.uniforms.uProgress.value = Math.max(0, Math.min((t - 0.13) / 0.76, 1));
      photoMaterial.uniforms.uTime.value = (now - start) / 1000;
      slotGlow.position.x = Math.sin(t * Math.PI * 6) * 1.7;
      slotGlow.intensity = 22 * (1 - lift * 0.72) + 2;
      camera.position.z = 10.4 - lift * 0.48;
      camera.lookAt(0, lift * -0.12, 0.55 + lift * 0.35);
      renderer.render(scene, camera);
      if (t < 1) frame = requestAnimationFrame(animate);
      else if (!completed.current) {
        completed.current = true;
        window.setTimeout(onComplete, 350);
      }
    };
    frame = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      texture.dispose();
      photoMaterial.dispose();
      materials.forEach((item) => item.dispose());
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) object.geometry.dispose();
      });
      renderer.dispose();
      mount.removeChild(renderer.domElement);
    };
  }, [image, onComplete]);

  return <div className="printer-scene" ref={mountRef} aria-label="Polaroid printing" />;
}

const COUNTDOWN_STEP_MS = 900;
const DEFAULT_OPENHOME_VOICE_LEAD_MS = 720;

function openHomeVoiceLeadMs() {
  try {
    const configured = Number(
      window.localStorage.getItem("ctrl-snap-countdown-lead-ms"),
    );
    if (Number.isFinite(configured)) {
      return Math.min(1500, Math.max(250, configured));
    }
  } catch {
    // Local storage can be unavailable in locked-down WebViews.
  }
  return DEFAULT_OPENHOME_VOICE_LEAD_MS;
}

function snapshotVideo(
  video: HTMLVideoElement | null,
  size: number,
  quality: number,
) {
  if (!video?.videoWidth || !video.videoHeight) return "";
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  ctx.translate(size, 0);
  ctx.scale(-1, 1);
  drawCover(ctx, video, 0, 0, size, size);
  return canvas.toDataURL("image/jpeg", quality);
}

async function requestOutfitLine(dataUrl: string) {
  if (!dataUrl) return "";
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch("/api/outfit-hype", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ dataUrl }),
      signal: controller.signal,
    });
    if (!response.ok) return "";
    const result = (await response.json()) as { line?: string };
    return typeof result.line === "string" ? result.line.trim().slice(0, 240) : "";
  } catch {
    return "";
  } finally {
    window.clearTimeout(timeout);
  }
}

export default function Booth() {
  const [stage, setStage] = useState<Stage>("welcome");
  const [photo, setPhoto] = useState("");
  const [finalImage, setFinalImage] = useState("");
  const [selectedSkin, setSelectedSkin] = useState<SkinId>("classic");
  const [cameraError, setCameraError] = useState("");
  const [countdown, setCountdown] = useState<number | null>(null);
  const [qr, setQr] = useState("");
  const [soundOn, setSoundOn] = useState(true);
  const [filterBusy, setFilterBusy] = useState(false);
  const [flashActive, setFlashActive] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const startCameraRef = useRef<() => Promise<void>>(async () => {});
  const captureRef = useRef<() => void>(() => {});
  const captureBusyRef = useRef(false);
  const captureSequenceRef = useRef(false);
  const flashTimersRef = useRef<number[]>([]);
  const outfitLinePromiseRef = useRef<Promise<string> | null>(null);
  const sessionRef = useRef("");
  const goodbyeSentRef = useRef(false);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => () => {
    stopCamera();
    flashTimersRef.current.forEach(window.clearTimeout);
  }, [stopCamera]);

  const startCamera = async () => {
    flashTimersRef.current.forEach(window.clearTimeout);
    flashTimersRef.current = [];
    captureSequenceRef.current = false;
    outfitLinePromiseRef.current = null;
    setFlashActive(false);
    if (soundOn) preparePrintSound();
    sessionRef.current = crypto.randomUUID();
    goodbyeSentRef.current = false;
    void ctrlSnapHostIsReady();
    setCameraError("");
    setStage("camera");
    try {
      const videoStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1600 }, height: { ideal: 1200 } },
        audio: false,
      });
      streamRef.current = videoStream;
      if (videoRef.current) {
        videoRef.current.srcObject = videoStream;
        await videoRef.current.play();
      }
    } catch {
      setCameraError("NO CAMERA");
    }
  };
  useEffect(() => {
    startCameraRef.current = startCamera;
  });

  const commitPhoto = async (data: string) => {
    if (captureBusyRef.current) return;
    captureBusyRef.current = true;
    setPhoto(data);
    stopCamera();
    if (soundOn) void playPrintSound();
    void (async () => {
      const outfitLinePromise =
        outfitLinePromiseRef.current ?? requestOutfitLine(data);
      outfitLinePromiseRef.current = null;
      let imageUrl: string | undefined;
      try {
        const response = await fetch("/api/photos", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ dataUrl: data }),
        });
        if (response.ok) {
          const published = (await response.json()) as {
            id: string;
            url?: string;
          };
          imageUrl =
            published.url ||
            `${window.location.origin}/api/photos/${published.id}`;
        }
      } catch {
        imageUrl = undefined;
      }
      const compliment = await outfitLinePromise;
      await sendCtrlSnapHostEvent({
        type: "photo_captured",
        image_url: imageUrl,
        compliment: compliment || undefined,
        session_id: sessionRef.current,
      });
    })();
    const print = await renderPrint(data, "classic");
    setSelectedSkin("classic");
    setFinalImage(print);
    setStage("printing");
    captureBusyRef.current = false;
  };

  const captureFrame = () => {
    if (captureBusyRef.current) return;
    const frame = snapshotVideo(videoRef.current, 1200, 0.92);
    if (frame) void commitPhoto(frame);
  };
  const capture = () => {
    if (countdown !== null || captureBusyRef.current || captureSequenceRef.current) return;
    captureSequenceRef.current = true;
    const visionFrame = snapshotVideo(videoRef.current, 768, 0.76);
    outfitLinePromiseRef.current = visionFrame
      ? requestOutfitLine(visionFrame)
      : null;
    void sendCtrlSnapHostEvent({
      type: "countdown_start",
      session_id: sessionRef.current,
    });
    const lead = openHomeVoiceLeadMs();
    const timers = [
      window.setTimeout(() => setCountdown(3), lead),
      window.setTimeout(() => setCountdown(2), lead + COUNTDOWN_STEP_MS),
      window.setTimeout(() => setCountdown(1), lead + COUNTDOWN_STEP_MS * 2),
      window.setTimeout(() => {
        setCountdown(null);
        setFlashActive(true);
      }, lead + COUNTDOWN_STEP_MS * 3),
      window.setTimeout(() => {
        captureFrame();
        captureSequenceRef.current = false;
      }, lead + COUNTDOWN_STEP_MS * 3 + 260),
      window.setTimeout(() => {
        setFlashActive(false);
        flashTimersRef.current = [];
      }, lead + COUNTDOWN_STEP_MS * 3 + 760),
    ];
    flashTimersRef.current = timers;
  };
  useEffect(() => {
    captureRef.current = capture;
  });

  useEffect(() => {
    const handleCaptureHotkey = (event: KeyboardEvent) => {
      const isSpace =
        event.code === "Space" &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        !event.shiftKey;
      const isBoothShortcut =
        event.code === "KeyB" &&
        event.metaKey &&
        event.shiftKey &&
        !event.ctrlKey &&
        !event.altKey;
      if (
        (stage !== "welcome" && stage !== "camera") ||
        event.repeat ||
        (!isSpace && !isBoothShortcut)
      ) {
        return;
      }
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, select, [contenteditable='true']")) return;
      event.preventDefault();
      if (stage === "welcome") {
        void startCameraRef.current();
        return;
      }
      if (soundOn) preparePrintSound();
      captureRef.current();
    };
    window.addEventListener("keydown", handleCaptureHotkey);
    return () => window.removeEventListener("keydown", handleCaptureHotkey);
  }, [soundOn, stage]);

  const uploadPhoto = (file?: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      void commitPhoto(String(reader.result));
    };
    reader.readAsDataURL(file);
  };

  const selectFilter = async (skin: SkinId) => {
    if (filterBusy || skin === selectedSkin) return;
    setFilterBusy(true);
    setQr("");
    setSelectedSkin(skin);
    const rendered = await renderPrint(photo, skin);
    setFinalImage(rendered);
    setFilterBusy(false);
  };

  const completePrint = useCallback(() => setStage("filters"), []);

  useEffect(() => {
    if (stage !== "filters" || !finalImage) return;
    let cancelled = false;
    const publish = async () => {
      try {
        const response = await fetch("/api/photos", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ dataUrl: finalImage }),
        });
        if (!response.ok) return;
        const { id, url: localUrl } = (await response.json()) as { id: string; url?: string };
        const url = localUrl || `${window.location.origin}/api/photos/${id}`;
        const code = await QRCode.toDataURL(url, {
          width: 420,
          margin: 1,
          color: { dark: "#060606", light: "#f3f3ee" },
        });
        if (!cancelled) setQr(code);
      } catch {
        if (!cancelled) setQr("");
      }
    };
    void publish();
    return () => {
      cancelled = true;
    };
  }, [finalImage, stage]);

  const reset = () => {
    stopCamera();
    setPhoto("");
    setFinalImage("");
    setQr("");
    setSelectedSkin("classic");
    captureBusyRef.current = false;
    captureSequenceRef.current = false;
    outfitLinePromiseRef.current = null;
    flashTimersRef.current.forEach(window.clearTimeout);
    flashTimersRef.current = [];
    setCountdown(null);
    setFlashActive(false);
    setStage("welcome");
  };

  const download = () => {
    if (!goodbyeSentRef.current) {
      goodbyeSentRef.current = true;
      void sendCtrlSnapHostEvent({
        type: "goodbye",
        session_id: sessionRef.current,
      });
    }
    const nativeBridge = (
      window as typeof window & {
        webkit?: { messageHandlers?: { savePhoto?: { postMessage: (value: string) => void } } };
      }
    ).webkit?.messageHandlers?.savePhoto;
    if (nativeBridge) {
      nativeBridge.postMessage(finalImage);
      return;
    }
    const a = document.createElement("a");
    a.href = finalImage;
    a.download = `SNAPPY-BOOTH-${Date.now()}.jpg`;
    a.click();
  };

  return (
    <main className={`booth stage-${stage}`}>
      <div className="noise" />
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />
      {flashActive && <div className="camera-flash" aria-hidden="true" />}
      <header className="topbar">
        <button className="wordmark" onClick={reset} aria-label="Restart Snappy Booth">
          SNAPPY BOOTH
        </button>
        <div className="event-lockup"><span>CTRL OVERDRIVE</span></div>
        <Progress stage={stage} />
      </header>

      {stage === "welcome" && (
        <section className="welcome minimal-welcome screen">
          <div className="welcome-copy">
            <p className="welcome-prompt">Take a fun photo!</p>
            <button className="primary enter-button" data-snappy-trigger onClick={startCamera}>
              NEXT <span>↗</span>
            </button>
          </div>
          <div className="portal" aria-hidden="true">
            <div className="portal-frame">
              <div className="scanline" />
              <ChromeStar className="star-one" />
              <ChromeStar className="star-two" />
              <div className="lens-ring"><i /></div>
            </div>
          </div>
        </section>
      )}

      {stage === "camera" && (
        <section className="camera-screen screen">
          <div className="camera-title"><b>01</b><span>SPACE / ⌘⇧B / TAP</span></div>
          <button
            className="icon-button sound-icon"
            onClick={() => setSoundOn((value) => !value)}
            aria-label={soundOn ? "Turn print sound off" : "Turn print sound on"}
          >
            {soundOn ? "◖))" : "×"}
          </button>
          <div className="camera-wrap">
            <video ref={videoRef} muted playsInline />
            <div className="viewfinder">
              <i className="tl" /><i className="tr" /><i className="bl" /><i className="br" />
              <b>●</b>
            </div>
            {countdown !== null && <div className="countdown">{countdown}</div>}
            <div
              className="capture-hotkey"
              aria-label="Press Space or Command Shift B to take a photo"
            >
              <span>SPACE</span>
              <i>⌘⇧B</i>
            </div>
            {cameraError && (
              <div className="camera-error">
                <strong>{cameraError}</strong>
              </div>
            )}
          </div>
          <div className="capture-dock">
            <button className="icon-button" onClick={() => fileRef.current?.click()} aria-label="Load photo">
              ↑
            </button>
            <button
              className="shutter"
              data-snappy-trigger
              onClick={capture}
              disabled={!!cameraError || countdown !== null}
            >
              <span />
            </button>
            <button className="icon-button" onClick={reset} aria-label="Start over">↻</button>
          </div>
          <input
            ref={fileRef}
            className="visually-hidden"
            type="file"
            accept="image/*"
            onChange={(event) => uploadPhoto(event.target.files?.[0])}
          />
        </section>
      )}

      {stage === "printing" && (
        <section className="printing-screen printer-screen screen">
          <div className="step-label"><b>02</b><span>PRINTING</span></div>
          <PrinterScene image={finalImage} onComplete={completePrint} />
        </section>
      )}

      {stage === "filters" && (
        <section className="filter-screen screen">
          <div className="step-label filter-label"><b>03</b><span>FILTER</span></div>
          <div className="filter-stage">
            <div className={`filter-polaroid ${filterBusy ? "busy" : ""}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={finalImage} alt="Filtered Snappy Booth print" />
              <i className="shine" />
            </div>
            <div className="filter-controls">
              <div className="filter-strip">
                {SKINS.map((skin) => (
                  <button
                    key={skin.id}
                    className={selectedSkin === skin.id ? "selected" : ""}
                    onClick={() => void selectFilter(skin.id)}
                  >
                    <i className={`filter-dot dot-${skin.id}`} />
                    <span>{skin.name}</span>
                  </button>
                ))}
              </div>
              <div className="save-row">
                <button className="save-button" onClick={download} aria-label="Save photo">↓</button>
                <button className="retake-button" onClick={reset} aria-label="Take another photo">↻</button>
                <div className="qr-handoff">
                  <div className="qr-instruction">
                    <svg viewBox="0 0 64 38" aria-hidden="true">
                      <path d="M3 4c15 1 26 8 33 20 4 7 9 9 18 9" />
                      <path d="m46 25 9 8-10 3" />
                    </svg>
                    <span>SCAN TO</span>
                    <strong>VIEW / DOWNLOAD</strong>
                  </div>
                  <div className="mini-qr">
                    {qr ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={qr} alt="Scan to view or download your picture" />
                    ) : <i />}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
