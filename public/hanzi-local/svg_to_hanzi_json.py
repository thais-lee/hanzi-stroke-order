#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
SVG (Inkscape) -> JSON cho HanziWriter

- Scale vào khung 0..1024
- Lật trục Y (gốc toạ độ chuyển sang bottom-left)
- Chuẩn hoá M/L/H/V/C/S/Q/T/A/Z sang tuyệt đối
- Hỗ trợ A (arc) khi flip Y: đảo sweep-flag, âm rotation
- Đọc g#layer-strokes (bắt buộc) + g#layer-medians (tuỳ chọn)
- Median parser không treo: luôn bỏ qua tham số lệnh không hỗ trợ
- Tuỳ chọn: --no-medians / --center / --verbose
"""

import re, json, time, argparse
import xml.etree.ElementTree as ET

NS = {
    "svg": "http://www.w3.org/2000/svg",
    "inkscape": "http://www.inkscape.org/namespaces/inkscape",
}
TARGET = 1024.0
NUM_RE = r"-?\d*\.?\d+(?:[eE][-+]?\d+)?"
TOK_RE = re.compile(r"[AaCcHhLlMmQqSsTtVvZz]|" + NUM_RE)

def is_cmd(tok: str) -> bool:
    return bool(tok) and tok[0].isalpha()

def trim_num(x: float) -> str:
    s = f"{x:.6f}".rstrip("0").rstrip(".")
    return s or "0"

def parse_viewbox_or_wh(root):
    vb = root.attrib.get("viewBox")
    if vb:
        parts = [float(x) for x in re.split(r"[,\s]+", vb.strip()) if x]
        if len(parts) == 4:
            return parts
    def px(v):
        if v is None: return None
        return float(re.sub(r"px$","",v))
    w = px(root.attrib.get("width"))
    h = px(root.attrib.get("height"))
    return [0.0, 0.0, w or TARGET, h or TARGET]

def find_layer(root, key_id, label_keywords):
    keys = [k.lower() for k in label_keywords]
    for g in root.findall(".//svg:g", NS):
        if g.attrib.get("id","") == key_id:
            return g
        label = g.attrib.get(f"{{{NS['inkscape']}}}label","").lower()
        if any(k in label for k in keys):
            return g
    return None

def tokens(d: str): return TOK_RE.findall(d)

def transform_point(x,y,minx,miny,sx,sy):
    X = (x - minx) * sx
    Y = TARGET - ((y - miny) * sy)
    return X, Y

def arc_after_flip_y(rx,ry,rot_deg,laf,swf):
    rot2 = -rot_deg
    swf2 = 0 if int(round(swf)) == 1 else 1
    return abs(rx), abs(ry), rot2, int(round(laf)), swf2

def path_to_abs_flipped_fast(d, minx, miny, sx, sy):
    ts = tokens(d); n=len(ts); i=0; out=[]; cx=cy=None; sx0=sy0=None; prev=None
    def get_nums(k):
        nonlocal i
        if i+k>n or any(is_cmd(ts[i+j]) for j in range(k)): return None
        vals=[float(ts[i+j]) for j in range(k)]; i+=k; return vals
    while i<n:
        if is_cmd(ts[i]): cmd=ts[i]; i+=1
        else:
            if prev is None: break
            cmd=prev
        up=cmd.upper(); rel=cmd.islower()
        if up=='M':
            first=True
            while True:
                vs=get_nums(2)
                if not vs: break
                x,y=vs
                if rel and cx is not None and cy is not None: x+=cx; y+=cy
                if first:
                    cx,cy=x,y; sx0,sy0=cx,cy
                    X,Y=transform_point(cx,cy,minx,miny,sx,sy); out.append(f"M {trim_num(X)} {trim_num(Y)}")
                    first=False
                else:
                    cx,cy=x,y
                    X,Y=transform_point(cx,cy,minx,miny,sx,sy); out.append(f"L {trim_num(X)} {trim_num(Y)}")
        elif up=='L':
            while True:
                vs=get_nums(2)
                if not vs: break
                x,y=vs
                if rel and cx is not None and cy is not None: x+=cx; y+=cy
                cx,cy=x,y
                X,Y=transform_point(cx,cy,minx,miny,sx,sy); out.append(f"L {trim_num(X)} {trim_num(Y)}")
        elif up=='H':
            while True:
                vs=get_nums(1)
                if not vs: break
                x=vs[0]
                if cx is None or cy is None: continue
                if rel: x+=cx
                cx=x
                X,Y=transform_point(cx,cy,minx,miny,sx,sy); out.append(f"L {trim_num(X)} {trim_num(Y)}")
        elif up=='V':
            while True:
                vs=get_nums(1)
                if not vs: break
                y=vs[0]
                if cx is None or cy is None: continue
                if rel: y+=cy
                cy=y
                X,Y=transform_point(cx,cy,minx,miny,sx,sy); out.append(f"L {trim_num(X)} {trim_num(Y)}")
        elif up=='C':
            while True:
                vs=get_nums(6)
                if not vs: break
                x1,y1,x2,y2,x,y=vs
                if rel and cx is not None and cy is not None:
                    x1+=cx; y1+=cy; x2+=cx; y2+=cy; x+=cx; y+=cy
                cx,cy=x,y
                X1,Y1=transform_point(x1,y1,minx,miny,sx,sy)
                X2,Y2=transform_point(x2,y2,minx,miny,sx,sy)
                X ,Y =transform_point(x ,y ,minx,miny,sx,sy)
                out.append(f"C {trim_num(X1)} {trim_num(Y1)} {trim_num(X2)} {trim_num(Y2)} {trim_num(X)} {trim_num(Y)}")
        elif up=='S':
            while True:
                vs=get_nums(4)
                if not vs: break
                x2,y2,x,y=vs
                if rel and cx is not None and cy is not None:
                    x2+=cx; y2+=cy; x+=cx; y+=cy
                cx,cy=x,y
                X2,Y2=transform_point(x2,y2,minx,miny,sx,sy)
                X ,Y =transform_point(x ,y ,minx,miny,sx,sy)
                out.append(f"S {trim_num(X2)} {trim_num(Y2)} {trim_num(X)} {trim_num(Y)}")
        elif up=='Q':
            while True:
                vs=get_nums(4)
                if not vs: break
                x1,y1,x,y=vs
                if rel and cx is not None and cy is not None:
                    x1+=cx; y1+=cy; x+=cx; y+=cy
                cx,cy=x,y
                X1,Y1=transform_point(x1,y1,minx,miny,sx,sy)
                X ,Y =transform_point(x ,y ,minx,miny,sx,sy)
                out.append(f"Q {trim_num(X1)} {trim_num(Y1)} {trim_num(X)} {trim_num(Y)}")
        elif up=='T':
            while True:
                vs=get_nums(2)
                if not vs: break
                x,y=vs
                if rel and cx is not None and cy is not None: x+=cx; y+=cy
                cx,cy=x,y
                X,Y=transform_point(x,y,minx,miny,sx,sy); out.append(f"T {trim_num(X)} {trim_num(Y)}")
        elif up=='A':
            while True:
                vs=get_nums(7)
                if not vs: break
                rx,ry,rot,laf,swf,x,y=vs
                if rel and cx is not None and cy is not None: x+=cx; y+=cy
                cx,cy=x,y
                X,Y=transform_point(x,y,minx,miny,sx,sy)
                rx2,ry2,rot2,laf2,swf2=arc_after_flip_y(rx*sx,ry*sy,rot,laf,swf)
                out.append(f"A {trim_num(rx2)} {trim_num(ry2)} {trim_num(rot2)} {int(laf2)} {int(swf2)} {trim_num(X)} {trim_num(Y)}")
        elif up=='Z':
            out.append("Z")
            if sx0 is not None and sy0 is not None:
                cx,cy=sx0,sy0
        prev=cmd
    return " ".join(out)

def extract_medians_recursive(node, minx, miny, sx, sy, out):
    for el in list(node):
        tag = (el.tag.split("}",1)[-1] if isinstance(el.tag,str) else "")
        t = tag.lower()
        if t == "g":
            extract_medians_recursive(el, minx, miny, sx, sy, out); continue
        if t == "line":
            try:
                x1=float(el.attrib.get("x1","0")); y1=float(el.attrib.get("y1","0"))
                x2=float(el.attrib.get("x2","0")); y2=float(el.attrib.get("y2","0"))
                X1,Y1=transform_point(x1,y1,minx,miny,sx,sy)
                X2,Y2=transform_point(x2,y2,minx,miny,sx,sy)
                out.append([[X1,Y1],[X2,Y2]])
            except: pass
            continue
        if t == "polyline":
            pts_attr = el.attrib.get("points","") or ""
            seg=[]
            for a,b in re.findall(rf"({NUM_RE})\s*,\s*({NUM_RE})", pts_attr):
                x=float(a); y=float(b)
                X,Y=transform_point(x,y,minx,miny,sx,sy); seg.append([X,Y])
            if seg: out.append(seg)
            continue
        if t == "path":
            d = el.attrib.get("d","") or ""
            ts=tokens(d); i=0; n=len(ts); prev=None; cx=cy=None; seg=[]
            def get2():
                nonlocal i
                if i+1<n and (not is_cmd(ts[i])) and (not is_cmd(ts[i+1])):
                    x=float(ts[i]); y=float(ts[i+1]); i+=2; return x,y,True
                return 0,0,False
            while i<n:
                if is_cmd(ts[i]): cmd=ts[i]; i+=1
                else:
                    if prev is None: break
                    cmd=prev
                up=cmd.upper(); rel=cmd.islower()
                if up=="M":
                    x,y,ok=get2()
                    if not ok: break
                    if rel and cx is not None and cy is not None: x+=cx; y+=cy
                    cx,cy=x,y; X,Y=transform_point(x,y,minx,miny,sx,sy); seg.append([X,Y])
                elif up=="L":
                    x,y,ok=get2()
                    if not ok: break
                    if rel and cx is not None and cy is not None: x+=cx; y+=cy
                    cx,cy=x,y; X,Y=transform_point(x,y,minx,miny,sx,sy); seg.append([X,Y])
                else:
                    # QUAN TRỌNG: bỏ qua toàn bộ tham số của lệnh không hỗ trợ
                    while i<n and not is_cmd(ts[i]): i+=1
                prev=cmd
            if seg: out.append(seg)
            continue
        # phần tử khác: bỏ qua

def center_shapes(strokes, medians, fit=False, pad=0.0):
    """
    Căn giữa dựa trên bbox chính xác:
    - Với L/H/V: dùng 2 đầu mút
    - Với Q/T: tìm cực trị giải tích (đạo hàm tuyến tính)
    - Với C/S: tìm cực trị giải tích (đạo hàm bậc hai)
    - Với A: dùng hai đầu mút (đủ cho chữ Hán)
    fit=True  -> scale đồng nhất để đưa bbox vào [pad,1024-pad]
    pad: đơn vị pixels trong hệ 1024
    """

    def cubic_point(p0, p1, p2, p3, t):
        u = 1 - t
        x = (u**3)*p0[0] + 3*(u*u)*t*p1[0] + 3*u*(t*t)*p2[0] + (t**3)*p3[0]
        y = (u**3)*p0[1] + 3*(u*u)*t*p1[1] + 3*u*(t*t)*p2[1] + (t**3)*p3[1]
        return (x, y)

    def quad_point(p0, p1, p2, t):
        u = 1 - t
        x = (u*u)*p0[0] + 2*u*t*p1[0] + (t*t)*p2[0]
        y = (u*u)*p0[1] + 2*u*t*p1[1] + (t*t)*p2[1]
        return (x, y)

    def cubic_extrema_t(p0, p1, p2, p3):
        # B'(t) = 3*(1-t)^2*(p1-p0) + 6*(1-t)*t*(p2-p1) + 3*t^2*(p3-p2)
        # Cho từng toạ độ ta có đa thức bậc 2: a t^2 + b t + c = 0
        ts = set([0.0, 1.0])
        for dim in (0, 1):
            p0d, p1d, p2d, p3d = p0[dim], p1[dim], p2[dim], p3[dim]
            a = -p0d + 3*p1d - 3*p2d + p3d
            b =  2*(p0d - 2*p1d + p2d)
            c =  (p1d - p0d)
            # 3*(a t^2 + b t + c) = 0  ->  a t^2 + b t + c = 0
            disc = b*b - 4*a*c
            if abs(a) < 1e-12:
                if abs(b) > 1e-12:
                    t = -c / b
                    if 0 < t < 1: ts.add(t)
            elif disc >= 0:
                r = disc**0.5
                t1 = (-b - r) / (2*a)
                t2 = (-b + r) / (2*a)
                if 0 < t1 < 1: ts.add(t1)
                if 0 < t2 < 1: ts.add(t2)
        return sorted(ts)

    def quad_extrema_t(p0, p1, p2):
        ts = set([0.0, 1.0])
        for dim in (0, 1):
            p0d, p1d, p2d = p0[dim], p1[dim], p2[dim]
            denom = (p0d - 2*p1d + p2d)
            if abs(denom) > 1e-12:
                t = (p0d - p1d) / denom
                if 0 < t < 1: ts.add(t)
        return sorted(ts)

    def bbox_of_d(d):
        ts = tokens(d)
        n = len(ts); i = 0
        prev = None
        cx = cy = None
        last_c_ctrl = None
        last_q_ctrl = None

        xs, ys = [], []

        def take(k):
            nonlocal i
            vals = [float(ts[i+j]) for j in range(k)]
            i += k
            return vals

        while i < n:
            if is_cmd(ts[i]): cmd = ts[i]; i += 1
            else: cmd = prev
            up = cmd.upper()

            if up == "M":
                x, y = take(2); cx, cy = x, y
                xs.append(x); ys.append(y)
                last_c_ctrl = last_q_ctrl = None

            elif up == "L":
                x, y = take(2)
                xs += [cx, x]; ys += [cy, y]
                cx, cy = x, y
                last_c_ctrl = last_q_ctrl = None

            elif up == "H":
                (x,) = take(1)
                xs += [cx, x]; ys += [cy, cy]
                cx = x; last_c_ctrl = last_q_ctrl = None

            elif up == "V":
                (y,) = take(1)
                xs += [cx, cx]; ys += [cy, y]
                cy = y; last_c_ctrl = last_q_ctrl = None

            elif up == "C":
                x1, y1, x2, y2, x, y = take(6)
                p0 = (cx, cy); p1 = (x1, y1); p2 = (x2, y2); p3 = (x, y)
                for t in cubic_extrema_t(p0, p1, p2, p3):
                    px, py = cubic_point(p0, p1, p2, p3, t)
                    xs.append(px); ys.append(py)
                cx, cy = x, y
                last_c_ctrl = (x2, y2); last_q_ctrl = None

            elif up == "S":
                x2, y2, x, y = take(4)
                if last_c_ctrl is not None:
                    x1 = 2*cx - last_c_ctrl[0]
                    y1 = 2*cy - last_c_ctrl[1]
                else:
                    x1, y1 = cx, cy
                p0 = (cx, cy); p1 = (x1, y1); p2 = (x2, y2); p3 = (x, y)
                for t in cubic_extrema_t(p0, p1, p2, p3):
                    px, py = cubic_point(p0, p1, p2, p3, t)
                    xs.append(px); ys.append(py)
                cx, cy = x, y
                last_c_ctrl = (x2, y2); last_q_ctrl = None

            elif up == "Q":
                x1, y1, x, y = take(4)
                p0 = (cx, cy); p1 = (x1, y1); p2 = (x, y)
                for t in quad_extrema_t(p0, p1, p2):
                    px, py = quad_point(p0, p1, p2, t)
                    xs.append(px); ys.append(py)
                cx, cy = x, y
                last_q_ctrl = (x1, y1); last_c_ctrl = None

            elif up == "T":
                x, y = take(2)
                if last_q_ctrl is not None:
                    x1 = 2*cx - last_q_ctrl[0]
                    y1 = 2*cy - last_q_ctrl[1]
                else:
                    x1, y1 = cx, cy
                p0 = (cx, cy); p1 = (x1, y1); p2 = (x, y)
                for t in quad_extrema_t(p0, p1, p2):
                    px, py = quad_point(p0, p1, p2, t)
                    xs.append(px); ys.append(py)
                cx, cy = x, y
                last_q_ctrl = (x1, y1); last_c_ctrl = None

            elif up == "A":
                # dùng 2 đầu mút
                rx, ry, rot, laf, swf, x, y = take(7)
                xs += [cx, x]; ys += [cy, y]
                cx, cy = x, y
                last_c_ctrl = last_q_ctrl = None

            elif up == "Z":
                last_c_ctrl = last_q_ctrl = None

            prev = cmd

        if not xs or not ys:
            return None
        return (min(xs), min(ys), max(xs), max(ys))

    # 1) Tính bbox tổng cho tất cả strokes
    mins = []; maxs = []
    for d in strokes:
        bb = bbox_of_d(d)
        if bb:
            x0,y0,x1,y1 = bb
            mins.append((x0,y0)); maxs.append((x1,y1))
    if not mins:
        return strokes, medians

    minX = min(p[0] for p in mins); minY = min(p[1] for p in mins)
    maxX = max(p[0] for p in maxs); maxY = max(p[1] for p in maxs)

    cx = (minX + maxX) / 2.0
    cy = (minY + maxY) / 2.0

    tx = 1024.0/2 - cx
    ty = 1024.0/2 - cy

    # 2) nếu fit: scale đồng nhất để ôm sát khung (chừa pad)
    scale = 1.0
    if fit:
        bw = maxX - minX; bh = maxY - minY
        if bw > 0 and bh > 0:
            scale = min((1024.0 - 2*pad)/bw, (1024.0 - 2*pad)/bh)

    def translate_scale_d(d, tx, ty, s):
        ts = tokens(d); i=0; n=len(ts); prev=None; out=[]
        while i<n:
            if is_cmd(ts[i]): cmd=ts[i]; i+=1; out.append(cmd); prev=cmd; continue
            up = prev.upper()
            if up in ("M","L","T"):
                x=float(ts[i]); y=float(ts[i+1]); i+=2
                out += [trim_num(x*s + tx), trim_num(y*s + ty)]
            elif up=="H":
                x=float(ts[i]); i+=1; out.append(trim_num(x*s + tx))
            elif up=="V":
                y=float(ts[i]); i+=1; out.append(trim_num(y*s + ty))
            elif up=="C":
                x1=float(ts[i]); y1=float(ts[i+1]); x2=float(ts[i+2]); y2=float(ts[i+3]); x=float(ts[i+4]); y=float(ts[i+5]); i+=6
                out += [trim_num(x1*s+tx),trim_num(y1*s+ty),
                        trim_num(x2*s+tx),trim_num(y2*s+ty),
                        trim_num(x*s+tx), trim_num(y*s+ty)]
            elif up=="S":
                x2=float(ts[i]); y2=float(ts[i+1]); x=float(ts[i+2]); y=float(ts[i+3]); i+=4
                out += [trim_num(x2*s+tx),trim_num(y2*s+ty),
                        trim_num(x*s+tx), trim_num(y*s+ty)]
            elif up=="Q":
                x1=float(ts[i]); y1=float(ts[i+1]); x=float(ts[i+2]); y=float(ts[i+3]); i+=4
                out += [trim_num(x1*s+tx),trim_num(y1*s+ty),
                        trim_num(x*s+tx),  trim_num(y*s+ty)]
            elif up=="A":
                rx=float(ts[i]); ry=float(ts[i+1]); rot=float(ts[i+2]); laf=int(float(ts[i+3])); swf=int(float(ts[i+4])); x=float(ts[i+5]); y=float(ts[i+6]); i+=7
                # rx/ry cũng scale theo s
                out += [trim_num(rx*s), trim_num(ry*s), trim_num(rot), str(laf), str(swf),
                        trim_num(x*s+tx), trim_num(y*s+ty)]
            else:
                pass
        return " ".join(out)

    strokes2 = [translate_scale_d(d, tx, ty, scale) for d in strokes]
    medians2 = [[[p[0]*scale + tx, p[1]*scale + ty] for p in seg] for seg in medians] if medians else []
    return strokes2, medians2

    """
    Căn giữa chính xác:
    - Lấy mẫu Bezier C/S/Q theo 20 điểm/đoạn (đủ mượt cho bbox)
    - H/V: dùng 2 đầu mút
    - A (arc): dùng đầu mút (đa số chữ Hán không dùng A)
    """
    def bezier_cubic(p0, p1, p2, p3, steps=20):
        pts = []
        for k in range(steps + 1):
            t = k / steps
            u = 1 - t
            x = (u**3)*p0[0] + 3*(u*u)*t*p1[0] + 3*u*(t*t)*p2[0] + (t**3)*p3[0]
            y = (u**3)*p0[1] + 3*(u*u)*t*p1[1] + 3*u*(t*t)*p2[1] + (t**3)*p3[1]
            pts.append((x, y))
        return pts

    def bezier_quad(p0, p1, p2, steps=40):
        pts = []
        for k in range(steps + 1):
            t = k / steps
            u = 1 - t
            x = (u*u)*p0[0] + 2*u*t*p1[0] + (t*t)*p2[0]
            y = (u*u)*p0[1] + 2*u*t*p1[1] + (t*t)*p2[1]
            pts.append((x, y))
        return pts

    def all_points_from_d(d):
        ts = tokens(d)
        n = len(ts)
        i = 0
        prev_cmd = None
        pts = []
        cx = cy = None          # current point
        last_c_ctrl = None      # last cubic control (để phản chiếu cho 'S')
        last_q_ctrl = None      # last quad  control (để phản chiếu cho 'T')

        def num(k):
            nonlocal i
            if i + k > n or any(is_cmd(ts[i + j]) for j in range(k)):
                return None
            vals = [float(ts[i + j]) for j in range(k)]
            i += k
            return vals

        while i < n:
            if is_cmd(ts[i]): cmd = ts[i]; i += 1
            else: cmd = prev_cmd
            up = cmd.upper()

            if up == "M":
                v = num(2)
                if not v: break
                cx, cy = v
                pts.append((cx, cy))
                last_c_ctrl = last_q_ctrl = None

            elif up == "L":
                v = num(2)
                if not v or cx is None: break
                x, y = v
                pts.extend([(cx, cy), (x, y)])
                cx, cy = x, y
                last_c_ctrl = last_q_ctrl = None

            elif up == "H":
                v = num(1)
                if not v or cx is None or cy is None: break
                x = v[0]; pts.extend([(cx, cy), (x, cy)])
                cx = x; last_c_ctrl = last_q_ctrl = None

            elif up == "V":
                v = num(1)
                if not v or cx is None or cy is None: break
                y = v[0]; pts.extend([(cx, cy), (cx, y)])
                cy = y; last_c_ctrl = last_q_ctrl = None

            elif up == "C":
                v = num(6)
                if not v or cx is None or cy is None: break
                x1, y1, x2, y2, x, y = v
                pts += bezier_cubic((cx, cy), (x1, y1), (x2, y2), (x, y), steps=20)
                cx, cy = x, y
                last_c_ctrl = (x2, y2)    # control cuối của C
                last_q_ctrl = None

            elif up == "S":
                v = num(4)
                if not v or cx is None or cy is None: break
                x2, y2, x, y = v
                # control1 = phản chiếu control trước (nếu có), ngược lại lấy p0
                if last_c_ctrl is not None:
                    x1 = 2*cx - last_c_ctrl[0]
                    y1 = 2*cy - last_c_ctrl[1]
                else:
                    x1, y1 = cx, cy
                pts += bezier_cubic((cx, cy), (x1, y1), (x2, y2), (x, y), steps=20)
                cx, cy = x, y
                last_c_ctrl = (x2, y2)
                last_q_ctrl = None

            elif up == "Q":
                v = num(4)
                if not v or cx is None or cy is None: break
                x1, y1, x, y = v
                pts += bezier_quad((cx, cy), (x1, y1), (x, y), steps=20)
                cx, cy = x, y
                last_q_ctrl = (x1, y1)
                last_c_ctrl = None

            elif up == "T":
                v = num(2)
                if not v or cx is None or cy is None: break
                x, y = v
                if last_q_ctrl is not None:
                    x1 = 2*cx - last_q_ctrl[0]
                    y1 = 2*cy - last_q_ctrl[1]
                else:
                    x1, y1 = cx, cy
                pts += bezier_quad((cx, cy), (x1, y1), (x, y), steps=20)
                cx, cy = x, y
                last_q_ctrl = (x1, y1)
                last_c_ctrl = None

            elif up == "A":
                # Lấy hai đầu mút cho bbox (đủ tốt cho chữ Hán)
                v = num(7)
                if not v or cx is None or cy is None: break
                _, _, _, _, _, x, y = v
                pts.extend([(cx, cy), (x, y)])
                cx, cy = x, y
                last_c_ctrl = last_q_ctrl = None

            elif up == "Z":
                last_c_ctrl = last_q_ctrl = None

            prev_cmd = cmd

        return pts

    # gom tất cả điểm từ mọi stroke để tính bbox
    allx, ally = [], []
    for d in strokes:
        for x, y in all_points_from_d(d):
            allx.append(x); ally.append(y)

    if not allx or not ally:
        return strokes, medians  # không đủ dữ liệu để căn

    cx = (min(allx) + max(allx)) / 2.0
    cy = (min(ally) + max(ally)) / 2.0
    tx = 1024.0/2 - cx
    ty = 1024.0/2 - cy

    # dịch toàn bộ path tuyệt đối
    def translate_abs(d, tx, ty):
        ts = tokens(d); i=0; n=len(ts); prev=None; out=[]
        def take(k):
            nonlocal i
            vals = [float(ts[i+j]) for j in range(k)]
            i += k
            return vals
        while i < n:
            if is_cmd(ts[i]): cmd = ts[i]; i += 1; out.append(cmd); prev = cmd; continue
            up = prev.upper()
            if up in ("M","L","T"):
                x, y = take(2); out += [trim_num(x+tx), trim_num(y+ty)]
            elif up == "H":
                (x,) = take(1); out.append(trim_num(x+tx))
            elif up == "V":
                (y,) = take(1); out.append(trim_num(y+ty))
            elif up == "C":
                x1,y1,x2,y2,x,y = take(6)
                out += [trim_num(x1+tx),trim_num(y1+ty),
                        trim_num(x2+tx),trim_num(y2+ty),
                        trim_num(x+tx), trim_num(y+ty)]
            elif up == "S":
                x2,y2,x,y = take(4)
                out += [trim_num(x2+tx),trim_num(y2+ty),
                        trim_num(x+tx), trim_num(y+ty)]
            elif up == "Q":
                x1,y1,x,y = take(4)
                out += [trim_num(x1+tx),trim_num(y1+ty),
                        trim_num(x+tx), trim_num(y+ty)]
            elif up == "A":
                rx,ry,rot,laf,swf,x,y = take(7)
                out += [trim_num(rx),trim_num(ry),trim_num(rot),str(int(laf)),str(int(swf)),
                        trim_num(x+tx), trim_num(y+ty)]
            else:
                # Z hoặc lệnh lạ
                pass
        return " ".join(out)

    strokes2 = [translate_abs(d, tx, ty) for d in strokes]
    medians2 = [[[p[0]+tx, p[1]+ty] for p in seg] for seg in medians] if medians else []
    return strokes2, medians2

    xs,ys=[],[]
    def harvest(d):
        ts=tokens(d); i=0; n=len(ts); prev=None; pts=[]
        while i<n:
            if is_cmd(ts[i]): cmd=ts[i]; i+=1
            else: cmd=prev
            up=cmd.upper()
            if up in ("M","L","T"):
                if i+1<n and (not is_cmd(ts[i])) and (not is_cmd(ts[i+1])):
                    x=float(ts[i]); y=float(ts[i+1]); i+=2; pts.append((x,y))
                else: break
            elif up=="C":
                if i+5<n and not is_cmd(ts[i+5]):
                    x=float(ts[i+4]); y=float(ts[i+5]); i+=6; pts.append((x,y))
                else: break
            elif up=="S":
                if i+3<n and not is_cmd(ts[i+3]):
                    x=float(ts[i+2]); y=float(ts[i+3]); i+=4; pts.append((x,y))
                else: break
            elif up=="Q":
                if i+3<n and not is_cmd(ts[i+3]):
                    x=float(ts[i+2]); y=float(ts[i+3]); i+=4; pts.append((x,y))
                else: break
            elif up=="A":
                if i+6<n and not is_cmd(ts[i+6]):
                    x=float(ts[i+5]); y=float(ts[i+6]); i+=7; pts.append((x,y))
                else: break
            else:
                if up=="H" and i<n and not is_cmd(ts[i]): i+=1
                elif up=="V" and i<n and not is_cmd(ts[i]): i+=1
        return pts
    for d in strokes:
        for (x,y) in harvest(d): xs.append(x); ys.append(y)
    if not xs or not ys: return strokes, medians
    cx=(min(xs)+max(xs))/2.0; cy=(min(ys)+max(ys))/2.0
    tx=TARGET/2.0 - cx; ty=TARGET/2.0 - cy
    def translate_abs(d,tx,ty):
        ts=tokens(d); i=0; n=len(ts); prev=None; out=[]
        while i<n:
            if is_cmd(ts[i]): cmd=ts[i]; i+=1; out.append(cmd); prev=cmd; continue
            up=prev.upper()
            if up in ("M","L","T"):
                x=float(ts[i]); y=float(ts[i+1]); i+=2
                out += [trim_num(x+tx), trim_num(y+ty)]
            elif up=="H":
                x=float(ts[i]); i+=1; out.append(trim_num(x+tx))
            elif up=="V":
                y=float(ts[i]); i+=1; out.append(trim_num(y+ty))
            elif up=="C":
                x1=float(ts[i]); y1=float(ts[i+1]); x2=float(ts[i+2]); y2=float(ts[i+3]); x=float(ts[i+4]); y=float(ts[i+5]); i+=6
                out += [trim_num(x1+tx),trim_num(y1+ty),trim_num(x2+tx),trim_num(y2+ty),trim_num(x+tx),trim_num(y+ty)]
            elif up=="S":
                x2=float(ts[i]); y2=float(ts[i+1]); x=float(ts[i+2]); y=float(ts[i+3]); i+=4
                out += [trim_num(x2+tx),trim_num(y2+ty),trim_num(x+tx),trim_num(y+ty)]
            elif up=="Q":
                x1=float(ts[i]); y1=float(ts[i+1]); x=float(ts[i+2]); y=float(ts[i+3]); i+=4
                out += [trim_num(x1+tx),trim_num(y1+ty),trim_num(x+tx),trim_num(y+ty)]
            elif up=="A":
                rx=float(ts[i]); ry=float(ts[i+1]); rot=float(ts[i+2]); laf=int(float(ts[i+3])); swf=int(float(ts[i+4])); x=float(ts[i+5]); y=float(ts[i+6]); i+=7
                out += [trim_num(rx),trim_num(ry),trim_num(rot),str(laf),str(swf),trim_num(x+tx),trim_num(y+ty)]
            else:
                out.append(ts[i]); i+=1
        return " ".join(out)
    strokes2=[translate_abs(d,tx,ty) for d in strokes]
    medians2=[[[p[0]+tx,p[1]+ty] for p in seg] for seg in medians] if medians else []
    return strokes2, medians2

def convert(svg_path, out_path, no_medians=False, center=False, verbose=False):
    t0=time.perf_counter()
    root=ET.parse(svg_path).getroot()
    minx,miny,w,h=parse_viewbox_or_wh(root)
    sx=TARGET/w; sy=TARGET/h
    if verbose:
        print(f"[i] viewBox/WH: minx={minx}, miny={miny}, w={w}, h={h} -> sx={sx:.6f}, sy={sy:.6f}")

    sg=find_layer(root,"layer-strokes",["strokes","nét"])
    if sg is None:
        raise RuntimeError("Không tìm thấy layer-strokes.")

    items=[]
    for p in sg.findall(".//svg:path",NS):
        d=(p.attrib.get("d","") or "").strip()
        if d:
            items.append((p.attrib.get("id",""), d))

    def sidx(pid):
        m=re.match(r"^[sS](\d+)", pid or "")
        return int(m.group(1)) if m else 10**9

    # === FIX: sort đúng cú pháp ===
    items.sort(key=lambda t: sidx(t[0]))

    if verbose: print(f"[i] strokes found: {len(items)} (scan {time.perf_counter()-t0:.3f}s)")
    t1=time.perf_counter()
    strokes=[path_to_abs_flipped_fast(d,minx,miny,sx,sy) for _,d in items]
    if verbose: print(f"[i] convert strokes: {len(strokes)} (took {time.perf_counter()-t1:.3f}s)")

    medians=[]
    if not no_medians:
        mg=find_layer(root,"layer-medians",["median","trục"])
        if mg is not None:
            extract_medians_recursive(mg,minx,miny,sx,sy,medians)
        if verbose: print(f"[i] medians: {len(medians)}")
    else:
        if verbose: print("[i] medians: skipped (--no-medians)")

    if center:
        strokes, medians = center_shapes(strokes, medians)
        if verbose: print("[i] centered to (512,512)")

    data={"character":"", "strokes":strokes, "medians":medians, "radStrokes":[]}
    with open(out_path,"w",encoding="utf-8") as f:
        json.dump(data,f,ensure_ascii=False,separators=(",",":"))
    if verbose: print(f"[✓] saved: {out_path} (total {time.perf_counter()-t0:.3f}s)")

if __name__=="__main__":
    ap=argparse.ArgumentParser()
    ap.add_argument("input_svg")
    ap.add_argument("output_json")
    ap.add_argument("--no-medians",action="store_true")
    ap.add_argument("--center",action="store_true")
    ap.add_argument("--verbose",action="store_true")
    args=ap.parse_args()
    convert(args.input_svg,args.output_json,no_medians=args.no_medians,center=args.center,verbose=args.verbose)
