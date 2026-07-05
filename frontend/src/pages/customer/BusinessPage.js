import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import API from '../../utils/api';

export default function BusinessPage() {
  const { slug } = useParams();
  const [page, setPage] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    API.get(`/pages/${slug}`).then(r => setPage(r.data)).catch(() => setPage(null)).finally(() => setLoading(false));
  }, [slug]);

  if (loading) return (
    <div className="max-w-4xl mx-auto px-4 py-16 text-center text-gray-400">Loading...</div>
  );

  if (!page) return (
    <div className="max-w-4xl mx-auto px-4 py-20 text-center">
      <div className="text-6xl mb-4">404</div>
      <h1 className="text-2xl font-bold text-gray-800 mb-2" style={{ fontFamily: 'var(--font-display)' }}>Page Not Found</h1>
      <p className="text-gray-500 mb-6">This page doesn't exist or has been moved.</p>
      <Link to="/" className="btn-primary">← Back to Home</Link>
    </div>
  );

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10" style={{ background: 'var(--body-bg)' }}>
      <nav className="text-sm text-gray-500 flex items-center gap-2 mb-6">
        <Link to="/" style={{ color: 'var(--color-primary)' }}>Home</Link>
        <span>/</span>
        <span className="text-gray-700 font-medium">{page.title}</span>
      </nav>
      <div className="rounded-2xl border border-gray-100 p-8 sm:p-12" style={{ background: 'var(--card-bg)' }}>
        <h1 className="text-3xl font-bold text-gray-900 mb-6" style={{ fontFamily: 'var(--font-display)' }}>{page.title}</h1>
        <div
          className="prose prose-gray max-w-none"
          style={{ fontFamily: 'var(--font-body)' }}
          dangerouslySetInnerHTML={{ __html: page.content }}
        />
        <div className="mt-8 pt-6 border-t border-gray-100 text-xs text-gray-400">
          Last updated: {new Date(page.updatedAt).toLocaleDateString()}
        </div>
      </div>
    </div>
  );
}
