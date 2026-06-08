export function ErrorAlert({
  message,
}: {
  message: string;
}) {
  return (
    <div
      style={{
        background: '#ffe9e9',
        border: '1px solid #ffb3b3',
        color: '#b00020',
        padding: 12,
        borderRadius: 8,
        marginBottom: 12,
      }}
    >
      {message}
    </div>
  );
}

