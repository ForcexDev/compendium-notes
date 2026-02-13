import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Copy, Check, Download, Loader2, RotateCcw, PenLine, Eye, FileText } from 'lucide-react';
import { useAppStore } from '../../lib/store';
import { t } from '../../lib/i18n';
import { generatePdf } from '../../lib/pdf-generator';

export default function NotesEditor() {
    const { editedNotes, setEditedNotes, file, reset, locale, transcription } = useAppStore();
    const [copied, setCopied] = useState(false);
    const [downloading, setDownloading] = useState(false);
    const [downloaded, setDownloaded] = useState(false);
    const [activeTab, setActiveTab] = useState<'edit' | 'preview'>('edit');
    const [showTranscript, setShowTranscript] = useState(false);

    const handleCopy = async () => {
        await navigator.clipboard.writeText(showTranscript ? transcription : editedNotes);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleDownload = () => {
        setDownloading(true);
        setTimeout(() => {
            generatePdf({
                title: file?.name?.replace(/\.[^.]+$/, '') || 'Notes',
                date: new Date().toLocaleDateString(locale === 'es' ? 'es-CL' : 'en-US'),
                duration: '',
                content: showTranscript ? transcription : editedNotes,
            });
            setDownloading(false);
            setDownloaded(true);
            setTimeout(() => setDownloaded(false), 3000);
        }, 300);
    };

    const previewHtml = useMemo(() => {
        let html = editedNotes
            .replace(/^### (.+)$/gm, '<h3 style="font-size:1rem;font-weight:600;margin:1.25rem 0 0.5rem;color:var(--text-primary);">$1</h3>')
            .replace(/^## (.+)$/gm, '<h2 style="font-size:1.15rem;font-weight:600;margin:1.5rem 0 0.5rem;color:var(--text-primary);">$1</h2>')
            .replace(/^# (.+)$/gm, '<h1 style="font-size:1.3rem;font-weight:700;margin:1.75rem 0 0.5rem;color:var(--text-primary);">$1</h1>')
            .replace(/\*\*(.+?)\*\*/g, '<strong style="color:var(--text-primary);font-weight:600;">$1</strong>')
            .replace(/\*(.+?)\*/g, '<em>$1</em>')
            .replace(/^- (.+)$/gm, '<li style="margin:0.25rem 0;padding-left:0.25rem;">$1</li>')
            .replace(/(<li.*<\/li>\n?)+/g, '<ul style="list-style:disc;padding-left:1.25rem;margin:0.5rem 0;">$&</ul>')
            .replace(/\n\n/g, '<br/><br/>')
            .replace(/\n/g, '<br/>');
        return html;
    }, [editedNotes]);

    return (
        <div className="flex flex-col h-full rounded-xl overflow-hidden" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)' }}>
            {/* Toolbar */}
            <div className="flex items-center justify-between px-4 py-2.5" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                {/* Tabs (mobile) */}
                <div className="flex items-center gap-1 sm:hidden">
                    <button
                        onClick={() => setActiveTab('edit')}
                        className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md transition-colors"
                        style={{
                            background: activeTab === 'edit' && !showTranscript ? 'var(--bg-tertiary)' : 'transparent',
                            color: activeTab === 'edit' ? 'var(--text-primary)' : 'var(--text-muted)',
                        }}
                    >
                        <PenLine size={12} />
                        {t('app.editor.markdown', locale)}
                    </button>
                    <button
                        onClick={() => setActiveTab('preview')}
                        className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md transition-colors"
                        style={{
                            background: activeTab === 'preview' && !showTranscript ? 'var(--bg-tertiary)' : 'transparent',
                            color: activeTab === 'preview' ? 'var(--text-primary)' : 'var(--text-muted)',
                        }}
                    >
                        <Eye size={12} />
                        {t('app.editor.preview', locale)}
                    </button>
                </div>

                {/* Left actions */}
                <div className="hidden sm:flex items-center gap-2">
                    <span className="text-xs font-medium px-2" style={{ color: 'var(--text-muted)' }}>
                        {showTranscript ? (locale === 'es' ? 'Transcripción Original' : 'Original Text') : t('app.editor.markdown', locale)}
                    </span>
                </div>

                {/* Right actions */}
                <div className="flex items-center gap-1.5">
                    <button
                        onClick={() => setShowTranscript(!showTranscript)}
                        className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md transition-colors"
                        style={{
                            background: showTranscript ? 'var(--accent-subtle)' : 'transparent',
                            color: showTranscript ? 'var(--accent)' : 'var(--text-muted)',
                            border: `1px solid ${showTranscript ? 'var(--accent)' : 'var(--border-subtle)'}`
                        }}
                        title={locale === 'es' ? 'Ver transcripción original' : 'View original transcript'}
                    >
                        <FileText size={12} />
                        <span className="hidden sm:inline">{locale === 'es' ? 'Transcripción' : 'Transcript'}</span>
                    </button>

                    <div className="w-px h-4 mx-1" style={{ background: 'var(--border-subtle)' }}></div>

                    <button onClick={reset} className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md transition-colors" style={{ color: 'var(--text-muted)', border: '1px solid var(--border-subtle)' }}>
                        <RotateCcw size={12} />
                        <span className="hidden sm:inline">{t('app.editor.new', locale)}</span>
                    </button>
                    <button
                        onClick={handleCopy}
                        className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md transition-colors"
                        style={{
                            color: copied ? '#34d399' : 'var(--text-muted)',
                            border: `1px solid ${copied ? 'rgba(16,185,129,0.3)' : 'var(--border-subtle)'}`,
                        }}
                    >
                        {copied ? <Check size={12} /> : <Copy size={12} />}
                        <span className="hidden sm:inline">{copied ? t('app.editor.copied', locale) : t('app.editor.copy', locale)}</span>
                    </button>
                    <button
                        onClick={handleDownload}
                        disabled={downloading}
                        className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md font-medium text-white transition-colors"
                        style={{ background: downloaded ? '#10b981' : 'var(--accent)' }}
                    >
                        {downloading ? <Loader2 size={12} className="animate-spin" /> : downloaded ? <Check size={12} /> : <Download size={12} />}
                        <span className="hidden sm:inline">
                            {downloading ? t('app.editor.downloading', locale) : downloaded ? t('app.editor.downloaded', locale) : t('app.editor.download', locale)}
                        </span>
                    </button>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 flex min-h-0 relative">
                {showTranscript ? (
                    <div className="absolute inset-0 p-4 sm:p-5 overflow-auto custom-scrollbar">
                        <pre className="whitespace-pre-wrap font-mono text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                            {transcription}
                        </pre>
                    </div>
                ) : (
                    <>
                        {/* Markdown Editor */}
                        <div className={`flex-1 min-h-0 ${activeTab !== 'edit' ? 'hidden sm:block' : ''}`}>
                            <textarea
                                value={editedNotes}
                                onChange={(e) => setEditedNotes(e.target.value)}
                                className="w-full h-full resize-none bg-transparent p-4 sm:p-5 text-sm font-mono outline-none custom-scrollbar"
                                style={{ color: 'var(--text-primary)', lineHeight: 1.7 }}
                                spellCheck={false}
                            />
                        </div>

                        {/* Divider */}
                        <div className="hidden sm:block w-px" style={{ background: 'var(--border-subtle)' }}></div>

                        {/* Preview */}
                        <div className={`flex-1 min-h-0 overflow-auto custom-scrollbar p-4 sm:p-5 ${activeTab !== 'preview' ? 'hidden sm:block' : ''}`}>
                            <div
                                className="text-sm leading-relaxed max-w-none"
                                style={{ color: 'var(--text-secondary)' }}
                                dangerouslySetInnerHTML={{ __html: previewHtml }}
                            />
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
