#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import json, re, argparse

SIZE = 1024.0
NUM_RE = re.compile(r'[-+]?(?:\d+\.?\d*|\d*\.\d+)(?:[eE][-+]?\d+)?')

def path_tokens(d:str):
    if not d: return []
    return re.findall(r'[A-Za-z]|' + NUM_RE.pattern, d)

def bbox_of_path(d:str, steps:int=24):
    ts = path_tokens(d)
    i, n = 0, len(ts)
    if n == 0: return None
    cx = cy = 0.0
    prev = None
    last_c2 = None
    xs, ys = [], []

    def take(k):
        nonlocal i
        vals = [float(ts[i+j]) for j in range(k)]
        i += k
        return vals

    while i < n:
        t = ts[i]; i += 1
        cmd = t.upper() if t.isalpha() else prev
        if not t.isalpha(): i -= 1
        if cmd is None: break

        if cmd == 'M':
            x,y = take(2); cx,cy = x,y
            xs.append(x); ys.append(y); last_c2=None
        elif cmd == 'L':
            x,y = take(2); xs += [cx,x]; ys += [cy,y]; cx,cy=x,y; last_c2=None
        elif cmd == 'H':
            x, = take(1); xs += [cx,x]; ys += [cy,cy]; cx=x; last_c2=None
        elif cmd == 'V':
            y, = take(1); xs += [cx,cx]; ys += [cy,y]; cy=y; last_c2=None
        elif cmd == 'C':
            x1,y1,x2,y2,x,y = take(6)
            for s in range(steps+1):
                tt=s/steps; u=1-tt
                px=(u**3)*cx+3*(u*u)*tt*x1+3*u*(tt*tt)*x2+(tt**3)*x
                py=(u**3)*cy+3*(u*u)*tt*y1+3*u*(tt*tt)*y2+(tt**3)*y
                xs.append(px); ys.append(py)
            cx,cy=x,y; last_c2=(x2,y2)
        elif cmd == 'S':
            x2,y2,x,y = take(4)
            if last_c2 is not None:
                x1=2*cx-last_c2[0]; y1=2*cy-last_c2[1]
            else:
                x1,y1=cx,cy
            for s in range(steps+1):
                tt=s/steps; u=1-tt
                px=(u**3)*cx+3*(u*u)*tt*x1+3*u*(tt*tt)*x2+(tt**3)*x
                py=(u**3)*cy+3*(u*u)*tt*y1+3*u*(tt*tt)*y2+(tt**3)*y
                xs.append(px); ys.append(py)
            cx,cy=x,y; last_c2=(x2,y2)
        elif cmd == 'Q':
            x1,y1,x,y = take(4)
            for s in range(steps+1):
                tt=s/steps; u=1-tt
                px=(u*u)*cx+2*u*tt*x1+(tt*tt)*x
                py=(u*u)*cy+2*u*tt*y1+(tt*tt)*y
                xs.append(px); ys.append(py)
            cx,cy=x,y; last_c2=None
        elif cmd == 'T':
            x,y = take(2); xs += [cx,x]; ys += [cy,y]; cx,cy=x,y; last_c2=None
        elif cmd == 'A':
            rx,ry,rot,laf,swf,x,y = take(7)
            xs += [cx,x]; ys += [cy,y]; cx,cy=x,y; last_c2=None
        elif cmd == 'Z':
            last_c2=None
        prev = cmd

    if not xs: return None
    return (min(xs), min(ys), max(xs), max(ys))

def transform_path(d:str, s:float, dx:float, dy:float):
    ts = path_tokens(d)
    out=[]; i=0; n=len(ts); prev=None; axis=0; apos=0
    while i<n:
        t=ts[i]; i+=1
        if t.isalpha():
            prev=t.upper(); out.append(prev); axis=0; apos=0; continue
        v=float(t)
        if prev in ('M','L','T','Q','C','S'):
            out.append(f'{s*v+dx:.6f}' if axis==0 else f'{s*v+dy:.6f}')
            axis^=1
        elif prev=='H':
            out.append(f'{s*v+dx:.6f}')
        elif prev=='V':
            out.append(f'{s*v+dy:.6f}')
        elif prev=='A':
            if   apos in (0,1): out.append(f'{s*v:.6f}')
            elif apos in (2,3,4): out.append(f'{v:g}')
            elif apos==5: out.append(f'{s*v+dx:.6f}')
            elif apos==6: out.append(f'{s*v+dy:.6f}')
            apos=(apos+1)%7
        else:
            out.append(f'{v:.6f}')
    return " ".join(out)

def center_fit(data, char=None, fit=False, pad=None, pad_x=None, pad_y=None,
               bias_x=0.0, bias_y=0.0, y_up=False,
               balance_x=False, balance_y=False, verbose=False):
    strokes=data.get("strokes",[])
    medians=data.get("medians",[])
    bbs=[bbox_of_path(d) for d in strokes if d and d.strip()]
    bbs=[b for b in bbs if b]
    if not bbs:
        if verbose: print("[!] Không tìm thấy bbox.")
        return data

    minx=min(b[0] for b in bbs); miny=min(b[1] for b in bbs)
    maxx=max(b[2] for b in bbs); maxy=max(b[3] for b in bbs)
    cx=(minx+maxx)/2.0; cy=(miny+maxy)/2.0
    bw=(maxx-minx); bh=(maxy-miny)

    if pad is not None: pad_x=pad_y=float(pad)
    pad_x=float(0.0 if pad_x is None else pad_x)
    pad_y=float(0.0 if pad_y is None else pad_y)

    s=1.0
    if fit and bw>0 and bh>0:
        s=min((SIZE-2*pad_x)/bw, (SIZE-2*pad_y)/bh)

    # 1) đưa tâm bbox về giữa khung
    dx = SIZE/2 - s*cx
    dy = SIZE/2 - s*cy

    # 2) cân bằng lề (nếu bật)
    if balance_x or balance_y:
        tx_min = s*minx + dx; tx_max = s*maxx + dx
        ty_min = s*miny + dy; ty_max = s*maxy + dy
        if balance_x:
            left_gap  = tx_min - 0.0
            right_gap = SIZE - tx_max
            dx += (right_gap - left_gap)/2.0
        if balance_y:
            top_gap    = ty_min - 0.0
            bottom_gap = SIZE - ty_max
            dy += (bottom_gap - top_gap)/2.0

    # 3) áp bias SAU khi cân bằng để không bị triệt tiêu
    if y_up:  # +Y đi lên -> đảo dấu để bias_y dương vẫn kéo xuống
        bias_y = -bias_y
    dx += bias_x
    dy += bias_y

    if verbose:
        print(f"[i] bbox=({minx:.1f},{miny:.1f})–({maxx:.1f},{maxy:.1f}) w={bw:.1f}, h={bh:.1f}")
        print(f"[i] scale s={s:.6f}, pad_x={pad_x}, pad_y={pad_y}")
        print(f"[i] translate dx={dx:.2f}, dy={dy:.2f} (y_up={y_up})")

    data["strokes"]=[transform_path(d,s,dx,dy) for d in strokes]
    data["medians"]=[[[s*x+dx, s*y+dy] for (x,y) in seg] for seg in (medians or [])]
    if char is not None: data["character"]=char
    elif "character" not in data: data["character"]=""
    return data

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("input_json"); ap.add_argument("output_json")
    ap.add_argument("--char", type=str, default=None)
    ap.add_argument("--fit", action="store_true")
    ap.add_argument("--pad", type=float, default=None)
    ap.add_argument("--pad-x", type=float, default=None)
    ap.add_argument("--pad-y", type=float, default=None)
    ap.add_argument("--bias-x", type=float, default=0.0)
    ap.add_argument("--bias-y", type=float, default=0.0,
                    help="Mặc định dương= kéo xuống; nếu app dùng +Y đi lên, thêm --y-up.")
    ap.add_argument("--y-up", action="store_true", help="+Y của app đi lên (đảo dấu bias-y).")
    ap.add_argument("--balance-x", action="store_true")
    ap.add_argument("--balance-y", action="store_true")
    ap.add_argument("--verbose", action="store_true")
    args=ap.parse_args()

    with open(args.input_json,"r",encoding="utf-8") as f:
        data=json.load(f)
    out=center_fit(data,char=args.char,fit=args.fit,pad=args.pad,pad_x=args.pad_x,
                   pad_y=args.pad_y,bias_x=args.bias-x if False else args.bias_x,
                   bias_y=args.bias_y,y_up=args.y_up,balance_x=args.balance_x,
                   balance_y=args.balance_y,verbose=args.verbose)
    with open(args.output_json,"w",encoding="utf-8") as f:
        json.dump(out,f,ensure_ascii=False)
    if args.verbose: print("[✓] Wrote", args.output_json)

if __name__=="__main__":
    main()
