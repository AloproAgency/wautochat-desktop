'use client';

import { useNodeExecutionState } from './execution-context';

interface NodeExecutionOverlayProps {
  nodeId: string;
  children: React.ReactNode;
  warning?: boolean;
}

export default function NodeExecutionOverlay({ nodeId, children, warning }: NodeExecutionOverlayProps) {
  const execState = useNodeExecutionState(nodeId);
  const status = execState?.status;

  if (!status || status === 'idle') {
    if (warning) {
      return (
        <div style={{ position: 'relative' }}>
          {children}
          <div style={{
            position: 'absolute',
            bottom: -6,
            left: '50%',
            transform: 'translateX(-50%)',
            backgroundColor: '#f59e0b',
            color: '#fff',
            fontSize: 7,
            fontWeight: 700,
            padding: '0px 3px',
            borderRadius: 2,
            whiteSpace: 'nowrap',
            boxShadow: 'none',
            zIndex: 10,
            letterSpacing: '0.04em',
          }}>
            ! Config required
          </div>
        </div>
      );
    }
    return <>{children}</>;
  }

  const isExecuting = status === 'executing';
  const isSuccess = status === 'success';
  const isError = status === 'error';
  const isSkipped = status === 'skipped';

  const ringColor = isExecuting
    ? '#22c55e'
    : isSuccess
      ? '#22c55e'
      : isError
        ? '#ef4444'
        : '#9ca3af';

  const ringStyle: React.CSSProperties = {
    boxShadow: `0 0 0 2.5px ${ringColor}`,
    borderRadius: 12,
    animation: isExecuting ? 'executionPulse 1.5s ease-in-out infinite' : undefined,
  };

  return (
    <div style={{ position: 'relative' }}>
      <div style={ringStyle}>
        {children}
      </div>

      {/* Executing: spinning loader top-right */}
      {isExecuting && (
        <div
          style={{
            position: 'absolute',
            top: -8,
            right: -8,
            width: 22,
            height: 22,
            borderRadius: '50%',
            backgroundColor: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
            zIndex: 10,
          }}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            style={{ animation: 'executionSpin 0.8s linear infinite' }}
          >
            <circle
              cx="7"
              cy="7"
              r="5.5"
              stroke="#d1d5db"
              strokeWidth="2"
              fill="none"
            />
            <path
              d="M7 1.5A5.5 5.5 0 0 1 12.5 7"
              stroke="#22c55e"
              strokeWidth="2"
              strokeLinecap="round"
              fill="none"
            />
          </svg>
        </div>
      )}

      {/* Success: green checkmark badge top-right */}
      {isSuccess && (
        <div
          style={{
            position: 'absolute',
            top: -8,
            right: -8,
            width: 22,
            height: 22,
            borderRadius: '50%',
            backgroundColor: '#22c55e',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
            zIndex: 10,
          }}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path
              d="M2.5 6L5 8.5L9.5 3.5"
              stroke="#ffffff"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      )}

      {/* Error: red X badge top-right */}
      {isError && (
        <div
          style={{
            position: 'absolute',
            top: -8,
            right: -8,
            width: 22,
            height: 22,
            borderRadius: '50%',
            backgroundColor: '#ef4444',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
            zIndex: 10,
          }}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M2 2L8 8M8 2L2 8" stroke="#ffffff" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </div>
      )}

      {/* Skipped: gray dash badge top-right */}
      {isSkipped && (
        <div
          style={{
            position: 'absolute',
            top: -8,
            right: -8,
            width: 22,
            height: 22,
            borderRadius: '50%',
            backgroundColor: '#9ca3af',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
            zIndex: 10,
          }}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M2 5H8" stroke="#ffffff" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </div>
      )}

      {/* Duration pill below node (success/error) */}
      {(isSuccess || isError) && execState?.durationMs != null && (
        <div
          style={{
            position: 'absolute',
            bottom: -20,
            left: '50%',
            transform: 'translateX(-50%)',
            backgroundColor: '#1f2937',
            color: '#ffffff',
            fontSize: 10,
            fontWeight: 600,
            padding: '2px 8px',
            borderRadius: 10,
            whiteSpace: 'nowrap',
            zIndex: 10,
          }}
        >
          {execState.durationMs}ms
        </div>
      )}

      {/* Error text below node */}
      {isError && execState?.error && (
        <div
          style={{
            position: 'absolute',
            bottom: execState.durationMs != null ? -38 : -20,
            left: '50%',
            transform: 'translateX(-50%)',
            backgroundColor: '#fef2f2',
            color: '#dc2626',
            fontSize: 10,
            fontWeight: 500,
            padding: '2px 8px',
            borderRadius: 6,
            whiteSpace: 'nowrap',
            maxWidth: 200,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            border: '1px solid #fecaca',
            zIndex: 10,
          }}
        >
          {execState.error}
        </div>
      )}
    </div>
  );
}
