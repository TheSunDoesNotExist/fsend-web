// Обёртка «окно терминала»: верхняя панель со «светофором», заголовком и статусом.
export default function Terminal({ title = 'fsend@secure: ~', status, statusText, children }) {
  const cls = status === 'on' ? 'status-on' : status === 'off' ? 'status-off' : 'status-wait';
  return (
    <div className="term">
      <div className="term-bar">
        <span className="dot red" />
        <span className="dot yellow" />
        <span className="dot green" />
        <span className="term-title">{title}</span>
        {statusText
          ? <span className={`term-status ${cls}`}>● {statusText}</span>
          : <span className="term-status" style={{ width: 60 }} />}
      </div>
      <div className="term-body">{children}</div>
    </div>
  );
}
