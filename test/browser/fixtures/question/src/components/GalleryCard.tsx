'use client';

export function ApprovalCard({ row }: { row: { approver?: string; title?: string } }) {
  return (
    <div className="approval-card">
      <strong>{row.title}</strong> approved by {row.approver}
    </div>
  );
}

export function BeforeCards() {
  return <p className="before-cards">Before the cards</p>;
}

export function AfterCards() {
  return <p className="after-cards">After the cards</p>;
}
