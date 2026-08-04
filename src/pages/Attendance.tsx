import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';

function ApplyLeaveForm() {
  const queryClient = useQueryClient();
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [leaveType, setLeaveType] = useState('VACATION');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const apply = useMutation({
    mutationFn: async () =>
      (await api.post('/attendance/leave', {
        startDate: new Date(startDate).toISOString(),
        endDate: new Date(endDate).toISOString(),
        leaveType,
        reason: reason || undefined,
      })).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/attendance/leave'] });
      setStartDate(''); setEndDate(''); setReason(''); setError(null);
      setSubmitted(true);
      setTimeout(() => setSubmitted(false), 3000);
    },
    onError: (err: any) => setError(err.response?.data?.error ?? 'Failed to submit leave request'),
  });

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <h3 style={{ marginTop: 0 }}>Apply for leave</h3>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!startDate || !endDate) return setError('Pick a start and end date');
          apply.mutate();
        }}
      >
        <div className="grid grid-2">
          <div className="form-row"><label>Start date</label><input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required /></div>
          <div className="form-row"><label>End date</label><input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} required /></div>
          <div className="form-row">
            <label>Type</label>
            <select value={leaveType} onChange={(e) => setLeaveType(e.target.value)}>
              <option value="VACATION">Vacation</option>
              <option value="SICK">Sick</option>
              <option value="UNPAID">Unpaid</option>
              <option value="OTHER">Other</option>
            </select>
          </div>
          <div className="form-row"><label>Reason (optional)</label><input value={reason} onChange={(e) => setReason(e.target.value)} /></div>
        </div>
        {error && <div className="error-text">{error}</div>}
        {submitted && <div style={{ color: 'var(--success, #16a34a)', marginBottom: 8 }}>Leave request submitted.</div>}
        <button type="submit" disabled={apply.isPending}>{apply.isPending ? 'Submitting…' : 'Submit request'}</button>
      </form>
    </div>
  );
}

export default function Attendance() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const canApprove = user?.actorType === 'OWNER' || ['MANAGER'].includes(user?.role ?? '');

  const { data: requests, isLoading } = useQuery({
    queryKey: ['/attendance/requests'],
    queryFn: async () => (await api.get('/attendance/requests')).data,
    enabled: canApprove,
  });
  const { data: leaves } = useQuery({ queryKey: ['/attendance/leave'], queryFn: async () => (await api.get('/attendance/leave')).data, enabled: canApprove });

  const review = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => (await api.post(`/attendance/requests/${id}/review`, { status })).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['/attendance/requests'] }),
  });

  const reviewLeave = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => (await api.post(`/attendance/leave/${id}/review`, { status })).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['/attendance/leave'] }),
  });

  return (
    <div>
      <h2>Attendance & Leave</h2>

      <ApplyLeaveForm />

      {!canApprove ? (
        <div className="card">
          <p style={{ color: 'var(--muted)' }}>Your leave requests and their status will appear here once your manager reviews them. Check with your manager for approval status.</p>
        </div>
      ) : isLoading ? (
        <p>Loading…</p>
      ) : (
        <>
          <div className="card" style={{ marginBottom: 16 }}>
            <h3 style={{ marginTop: 0 }}>Pending check-ins</h3>
            {(requests ?? []).length === 0 ? <p style={{ color: 'var(--muted)' }}>None pending.</p> : (
              <table>
                <thead><tr><th>Employee</th><th>Role</th><th>Actions</th></tr></thead>
                <tbody>
                  {requests.map((r: any) => (
                    <tr key={r.id}>
                      <td>{r.employee.name}</td><td>{r.employee.role}</td>
                      <td style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => review.mutate({ id: r.id, status: 'APPROVED' })}>Approve</button>
                        <button className="danger" onClick={() => review.mutate({ id: r.id, status: 'REJECTED' })}>Reject</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="card">
            <h3 style={{ marginTop: 0 }}>Leave requests</h3>
            {(leaves ?? []).length === 0 ? <p style={{ color: 'var(--muted)' }}>None.</p> : (
              <table>
                <thead><tr><th>Employee</th><th>Dates</th><th>Type</th><th>Status</th><th>Actions</th></tr></thead>
                <tbody>
                  {leaves.map((l: any) => (
                    <tr key={l.id}>
                      <td>{l.employee.name}</td>
                      <td>{new Date(l.startDate).toLocaleDateString()} – {new Date(l.endDate).toLocaleDateString()}</td>
                      <td>{l.leaveType}</td>
                      <td><span className="badge">{l.status}</span></td>
                      <td style={{ display: 'flex', gap: 6 }}>
                        {l.status === 'PENDING' && <>
                          <button onClick={() => reviewLeave.mutate({ id: l.id, status: 'APPROVED' })}>Approve</button>
                          <button className="danger" onClick={() => reviewLeave.mutate({ id: l.id, status: 'REJECTED' })}>Reject</button>
                        </>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}
