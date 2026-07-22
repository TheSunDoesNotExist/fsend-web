export default function Terminal({ title = 'HOME / FSEND', status, statusText, onHome, children }) {
  const cls = status === 'on' ? 'status-on' : status === 'off' ? 'status-off' : 'status-wait';
  return (
    <div className="term">
      <div className="term-bar">
        <button className="term-brand" type="button" onClick={onHome} disabled={!onHome}>FSEND</button>
        <span className="term-title">{title}</span>
        <span className={`term-status ${cls}`}>
          <i className="presence-dot" />
          {statusText || ''}
        </span>
      </div>
      <div className="term-body">{children}</div>
    </div>
  );
}
