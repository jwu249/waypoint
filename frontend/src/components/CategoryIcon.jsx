export default function CategoryIcon({
  kind,
  size = 14,
  color = 'currentColor',
  strokeWidth = 1.6,
}) {
  const style = {
    width: size,
    height: size,
    stroke: color,
    fill: 'none',
    strokeWidth,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    flexShrink: 0,
  };

  switch (kind) {
    case 'food':
      return (
        <svg viewBox="0 0 16 16" style={style} aria-hidden="true">
          <path d="M4 2v6M4 2c-1 0-1.5 1-1.5 2.5S3 7 4 7M6 2v5a1 1 0 0 1-1 1H3M4 8v6M11 2c-1.5 0-2.5 2-2.5 4s1 3 2.5 3v5M13.5 2v12" />
        </svg>
      );
    case 'temple':
      return (
        <svg viewBox="0 0 16 16" style={style} aria-hidden="true">
          <path d="M2 6l6-3 6 3M3 6v7M13 6v7M2 13h12M5 13V8h6v5M6.5 13v-3h3v3" />
        </svg>
      );
    case 'walk':
      return (
        <svg viewBox="0 0 16 16" style={style} aria-hidden="true">
          <circle cx="9" cy="2.5" r="1.2" />
          <path d="M8 6l-2 2 2 2v4M10 7l-2-1-1 2 2 1M11 10l1 2M5 11l-1 2" />
        </svg>
      );
    case 'market':
      return (
        <svg viewBox="0 0 16 16" style={style} aria-hidden="true">
          <path d="M2 6h12l-1 8H3L2 6zM4 6V4a4 4 0 0 1 8 0v2" />
        </svg>
      );
    case 'coffee':
      return (
        <svg viewBox="0 0 16 16" style={style} aria-hidden="true">
          <path d="M3 6h9v4a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V6zM12 7h1.5a1.5 1.5 0 0 1 0 3H12M5 3c0-.7.5-1 .5-2M8 3c0-.7.5-1 .5-2" />
        </svg>
      );
    case 'stay':
      return (
        <svg viewBox="0 0 16 16" style={style} aria-hidden="true">
          <path d="M2 12V7.5A1.5 1.5 0 0 1 3.5 6H7a2 2 0 0 1 2 2v4M2 10h12M11 6h1.5A1.5 1.5 0 0 1 14 7.5V12M4.5 8.5h1" />
        </svg>
      );
    case 'route':
      return (
        <svg viewBox="0 0 16 16" style={style} aria-hidden="true">
          <circle cx="4" cy="12" r="1.5" />
          <circle cx="12" cy="4" r="1.5" />
          <path d="M5.5 12c4 0 1-6.5 5-6.5" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 16 16" style={style} aria-hidden="true">
          <circle cx="8" cy="8" r="5" />
        </svg>
      );
  }
}
