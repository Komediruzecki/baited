import React from 'react';
type Props = React.SVGProps<SVGSVGElement> & { size?: number };
// Integer cells share the landing's 10 × 10 pixel grid. Controls carry the label.
const icon = (path: string) => function PixelIcon({ size = 20, fill: _fill, ...props }: Props) {
  return <svg width={size} height={size} viewBox="0 0 10 10" fill="currentColor"
    shapeRendering="crispEdges" aria-hidden="true" focusable="false" {...props}><path d={path} /></svg>;
};
// Play, pause, sound, lock and card reuse the approved landing paths.
export const Play = icon('M1 1h2v1H1zM1 2h4v1H1zM1 3h6v1H1zM1 4h8v2H1zM1 6h6v1H1zM1 7h4v1H1zM1 8h2v1H1z');
export const Pause = icon('M1 1h3v8H1zM6 1h3v8H6z');
export const Volume2 = icon('M4 1h1v1H4zM3 2h2v1H3zM0 3h5v4H0zM3 7h2v1H3zM4 8h1v1H4zM6 4h1v2H6zM8 2h1v1H8zM9 3h1v4H9zM8 7h1v1H8z');
export const ShieldCheck = icon('M3 1h3v1H3zM2 2h1v2H2zM6 2h1v2H6zM1 4h7v1H1zM1 5h3v2H1zM5 5h3v2H5zM1 7h7v1H1z');
export const Card = icon('M2 1h6v1H2zM2 2h1v5H2zM7 2h1v5H7zM4 3h2v2H4zM2 7h6v1H2z');
export const MessageSquare = icon('M1 0h7v1H1zM0 1h1v5H0zM8 1h1v5H8zM1 6h7v1H1zM1 7h2v1H1zM1 8h1v1H1zM2 3h1v1H2zM4 3h1v1H4zM6 3h1v1H6z');
export const NoChat = icon('M1 0h7v1H1zM0 1h1v5H0zM8 1h1v5H8zM1 6h7v1H1zM1 7h2v1H1zM1 8h1v1H1zM2 3h5v1H2z');
export const Mic = icon('M4 0h2v1H4zM3 1h4v4H3zM4 5h2v1H4zM1 3h1v3H1zM8 3h1v3H8zM2 6h1v1H2zM7 6h1v1H7zM3 7h4v1H3zM4 8h2v1H4zM2 9h6v1H2z');
export const MicOff = icon('M4 0h2v1H4zM3 1h4v2H3zM5 3h2v2H5zM1 3h1v3H1zM8 3h1v3H8zM2 6h1v1H2zM7 6h1v1H7zM3 7h4v1H3zM4 8h2v1H4zM2 9h6v1H2zM0 0h1v1H0zM1 1h1v1H1zM2 2h1v1H2zM3 3h1v1H3zM4 4h1v1H4zM5 5h1v1H5zM6 6h1v1H6zM7 7h1v1H7zM8 8h1v1H8zM9 9h1v1H9z');
export const SkipForward = icon('M1 1h2v1H1zM1 2h3v1H1zM1 3h4v1H1zM1 4h5v2H1zM1 6h4v1H1zM1 7h3v1H1zM1 8h2v1H1zM7 1h2v8H7z');
export const Square = icon('M2 2h6v6H2z');
export const Timer = icon('M3 0h3v1H3zM4 1h1v1H4zM2 2h5v1H2zM1 3h1v1H1zM4 3h1v2H4zM7 3h1v1H7zM0 4h1v3H0zM8 4h1v3H8zM5 5h1v1H5zM1 7h1v1H1zM7 7h1v1H7zM2 8h5v1H2z');
export const Check = icon('M1 4h1v2H1zM2 5h1v2H2zM3 6h1v2H3zM4 5h1v2H4zM5 4h1v2H5zM6 3h1v2H6zM7 2h1v2H7zM8 1h1v2H8z');
export const X = icon('M1 1h2v2H1zM3 3h1v1H3zM4 4h2v2H4zM6 3h1v1H6zM7 1h2v2H7zM3 6h1v1H3zM1 7h2v2H1zM6 6h1v1H6zM7 7h2v2H7z');
export const ArrowRight = icon('M5 1h1v1H5zM6 2h1v1H6zM7 3h1v1H7zM1 4h8v2H1zM7 6h1v1H7zM6 7h1v1H6zM5 8h1v1H5z');
export const ArrowUpRight = icon('M3 1h6v6H8V3H7v1H6v1H5v1H4v1H3v1H2v1H1V7h1V6h1V5h1V4h1V3h1V2H3z');
export const ChevronRight = icon('M3 1h1v1H3zM4 2h1v1H4zM5 3h1v1H5zM6 4h1v2H6zM5 6h1v1H5zM4 7h1v1H4zM3 8h1v1H3z');
export const ChevronDown = icon('M1 3h2v1H1zM2 4h2v1H2zM3 5h2v1H3zM4 6h2v1H4zM5 5h2v1H5zM6 4h2v1H6zM7 3h2v1H7z');
export const Copy = icon('M1 0h6v1H1zM0 1h1v6H0zM3 2h6v1H3zM2 3h1v6H2zM9 3h1v6H9zM3 9h6v1H3z');
export const Link2 = icon('M1 3h3v1H1zM0 4h1v3H0zM1 7h3v1H1zM3 6h1v1H3zM3 5h4v1H3zM6 2h3v1H6zM6 3h1v1H6zM9 3h1v3H9zM6 6h3v1H6z');
export const Eye = icon('M3 1h4v1H3zM1 2h2v1H1zM7 2h2v1H7zM0 3h1v3H0zM9 3h1v3H9zM1 6h2v1H1zM7 6h2v1H7zM3 7h4v1H3zM4 3h2v3H4z');
export const Settings2 = icon('M4 0h2v2H4zM4 8h2v2H4zM0 4h2v2H0zM8 4h2v2H8zM1 1h2v2H1zM7 1h2v2H7zM1 7h2v2H1zM7 7h2v2H7zM3 2h4v1H3zM2 3h1v4H2zM7 3h1v4H7zM3 7h4v1H3zM4 4h2v2H4z');
export const LayoutDashboard = icon('M1 1h3v4H1zM6 1h3v2H6zM6 5h3v4H6zM1 7h3v2H1z');
export const Monitor = icon('M1 0h8v1H1zM0 1h1v6H0zM9 1h1v6H9zM1 7h8v1H1zM4 8h2v1H4zM2 9h6v1H2z');
export const Users = icon('M2 1h2v3H2zM6 1h2v3H6zM1 5h4v1H1zM0 6h1v3H0zM1 8h3v1H1zM6 5h3v1H6zM9 6h1v3H9zM6 8h3v1H6zM4 6h2v3H4z');
export const HelpCircle = icon('M2 0h6v1H2zM0 2h1v6H0zM9 2h1v6H9zM2 9h6v1H2zM1 1h1v1H1zM8 1h1v1H8zM1 8h1v1H1zM8 8h1v1H8zM3 2h3v1H3zM6 3h1v1H6zM5 4h1v1H5zM4 5h1v1H4zM4 7h1v1H4z');
export const LogOut = icon('M1 0h4v1H1zM0 1h1v8H0zM1 9h4v1H1zM6 2h1v1H6zM7 3h1v1H7zM3 4h6v2H3zM7 6h1v1H7zM6 7h1v1H6z');
export const Wifi = icon('M2 0h6v1H2zM0 1h2v1H0zM8 1h2v1H8zM3 3h4v1H3zM2 4h1v1H2zM7 4h1v1H7zM4 6h2v2H4z');
export const AlertTriangle = icon('M4 0h2v1H4zM3 1h1v2H3zM6 1h1v2H6zM2 3h1v2H2zM7 3h1v2H7zM1 5h1v2H1zM8 5h1v2H8zM0 7h1v2H0zM9 7h1v2H9zM1 9h8v1H1zM4 3h2v3H4zM4 7h2v1H4z');
export const RotateCcw = icon('M0 1h1v4H0zM1 4h4v1H1zM2 2h5v1H2zM7 3h1v1H7zM8 4h1v3H8zM7 7h1v1H7zM3 8h4v1H3zM2 7h1v1H2z');
export const Terminal = icon('M0 1h10v1H0zM0 2h1v7H0zM9 2h1v7H9zM1 8h8v1H1zM2 3h1v1H2zM3 4h1v1H3zM2 5h1v1H2zM5 6h3v1H5z');
export const Target = icon('M2 1h6v1H2zM1 2h1v6H1zM8 2h1v6H8zM2 8h6v1H2zM3 3h4v1H3zM3 4h1v3H3zM6 4h1v3H6zM4 6h2v1H4z');
export const Trash2 = icon('M3 0h4v1H3zM1 2h8v1H1zM2 3h1v6H2zM7 3h1v6H7zM3 9h4v1H3zM4 4h1v4H4zM6 4h1v4H6z');
export const Radio = MessageSquare;
export const Gamepad2 = LayoutDashboard;
// Legacy helper names retain imports without trophy, flame or star artwork.
export const Trophy = Check;
export const Flame = icon('M1 7h2v2H1zM3 5h2v4H3zM5 3h2v6H5zM7 1h2v8H7z');
export const Sparkles = Card;
