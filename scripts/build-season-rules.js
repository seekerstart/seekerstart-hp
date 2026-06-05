#!/usr/bin/env node
/*
 * build-season-rules.js
 * config/season_rule_pages.json を単一ソースとして、シーズン制度ページ（一覧＋各シーズン詳細）の
 * 静的HTMLを生成する。テンプレートは旧 js/season-rules.js の描画ロジックを逐語移植したもので、
 * 生成結果は従来のクライアント描画と同一になる（見た目を変えずに本文を初期HTMLへ焼き込む＝SEO対策）。
 *
 * 使い方:  node scripts/build-season-rules.js
 * 出力:    season-rules.html / season-rules-s1.html / season-rules-s2.html / season-rules-s3.html ...
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CONFIG_PATH = path.join(ROOT, 'config', 'season_rule_pages.json');
const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));

const INTERNAL_BASE_PATH = '/houou/';
const pageHref = (p) => `${INTERNAL_BASE_PATH}${String(p).replace(/^\/+/, '')}`;

// ---- 描画ヘルパ（旧 js/season-rules.js から逐語移植） ----

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function textToHtml(value) {
    return escapeHtml(value).replace(/\n/g, '<br>');
}

function detailUrl(slug) {
    return pageHref(`season-rules-${slug}.html`);
}

function imageTag(src, alt, className) {
    return `<img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" class="${className}" onerror="this.src='https://images.unsplash.com/photo-1518893063132-36e46dbe2428?auto=format&fit=crop&q=80&w=1200'">`;
}

function renderBlockList(blocks, emptyMessage, iconClass, accentClass) {
    if (!Array.isArray(blocks) || blocks.length === 0) {
        return `
                <div class="jp-card p-6 border border-white/10">
                    <p class="text-sm text-gray-400 leading-loose">${escapeHtml(emptyMessage)}</p>
                </div>
            `;
    }

    return blocks.map((block) => {
        const items = Array.isArray(block.items) && block.items.length > 0
            ? `
                    <ul class="space-y-2 text-sm text-gray-400 leading-loose">
                        ${block.items.map((item) => `
                            <li class="flex gap-3">
                                <span class="text-gold mt-1"><i class="fas fa-minus"></i></span>
                                <span>${escapeHtml(item)}</span>
                            </li>
                        `).join('')}
                    </ul>
                `
            : '';

        return `
                <article class="jp-card p-7 md:p-8 corner-deco h-full">
                    <div class="flex items-start justify-between gap-4 mb-5">
                        <div>
                            <div class="text-[10px] font-black tracking-[0.45em] uppercase text-gold/70 mb-2">Rule Block</div>
                            <h3 class="text-xl md:text-2xl font-serif font-black text-white leading-snug">${escapeHtml(block.title)}</h3>
                        </div>
                        <div class="w-11 h-11 shrink-0 rounded-full border border-white/10 bg-white/5 flex items-center justify-center text-gold">
                            <i class="${escapeHtml(iconClass)}"></i>
                        </div>
                    </div>
                    ${block.accent ? `<div class="inline-flex items-center px-4 py-3 mb-4 border ${accentClass} text-xl md:text-2xl font-black leading-snug">${escapeHtml(block.accent)}</div>` : ''}
                    ${block.body ? `<p class="text-sm text-gray-300 leading-loose mb-5">${textToHtml(block.body)}</p>` : ''}
                    ${items}
                </article>
            `;
    }).join('');
}

function renderRelatedLinkCard(options) {
    const {
        eyebrow,
        title,
        description,
        href,
        iconClass,
        muted
    } = options;

    const baseClass = muted
        ? 'block border border-white/5 bg-white/[0.03] px-5 py-5 rounded-sm opacity-55'
        : 'block border border-white/10 bg-white/5 px-5 py-5 rounded-sm hover:border-gold/40 transition-all duration-300';

    const content = `
            <div class="text-[10px] font-black tracking-[0.35em] uppercase text-white/35 mb-2">${escapeHtml(eyebrow)}</div>
            <div class="flex items-start justify-between gap-4 mb-3">
                <div class="text-lg font-serif font-bold text-white">${escapeHtml(title)}</div>
                <i class="${escapeHtml(iconClass)} text-gold/70 mt-1"></i>
            </div>
            <p class="text-sm text-gray-400 leading-loose">${escapeHtml(description)}</p>
        `;

    if (muted || !href) {
        return `<div class="${baseClass}">${content}</div>`;
    }

    return `<a href="${escapeHtml(href)}" class="${baseClass}">${content}</a>`;
}

function renderSeasonSwitchButton(options) {
    const {
        label,
        title,
        description,
        href,
        iconClass,
        muted
    } = options;

    const content = `
            <div class="flex items-center justify-between gap-4">
                <div class="min-w-0">
                    <div class="text-[10px] font-black tracking-[0.35em] uppercase text-gold/60 mb-2">${escapeHtml(label)}</div>
                    <div class="text-xl md:text-2xl font-serif font-black text-white mb-2">${escapeHtml(title)}</div>
                    <p class="text-sm text-gray-400 leading-loose">${escapeHtml(description)}</p>
                </div>
                <div class="w-12 h-12 md:w-14 md:h-14 shrink-0 rounded-full border border-white/10 bg-white/5 flex items-center justify-center text-gold">
                    <i class="${escapeHtml(iconClass)}"></i>
                </div>
            </div>
        `;

    const baseClass = muted
        ? 'block jp-card p-6 md:p-7 corner-deco opacity-55'
        : 'group block jp-card p-6 md:p-7 corner-deco hover:border-gold/40 transition-all duration-300';

    if (muted || !href) {
        return `<div class="${baseClass}">${content}</div>`;
    }

    return `
            <a href="${escapeHtml(href)}" class="${baseClass}">
                ${content}
            </a>
        `;
}

function renderScheduleTable(page) {
    const schedule = Array.isArray(page.schedule) ? page.schedule : [];

    if (schedule.length === 0) {
        return errorMarkup('このシーズンのスケジュールはまだ設定されていません。');
    }

    return `
            <div class="jp-card p-5 md:p-6 corner-deco">
                <div class="flex flex-col md:flex-row md:items-end md:justify-between gap-3 mb-5">
                    <div>
                        <div class="text-[10px] font-black tracking-[0.35em] uppercase text-gold/60 mb-2">Season Period</div>
                        <div class="text-lg md:text-xl font-serif font-bold text-white">${escapeHtml(page.period_label)}</div>
                    </div>
                    <div class="text-xs text-gray-500">毎週月曜開催予定</div>
                </div>
                <div class="overflow-x-auto">
                    <table class="w-full min-w-[420px]">
                        <thead>
                            <tr class="border-b border-gold/20">
                                <th class="py-3 px-3 text-left text-[11px] font-black tracking-[0.25em] uppercase text-gold">週</th>
                                <th class="py-3 px-3 text-left text-[11px] font-black tracking-[0.25em] uppercase text-gold">開催日付</th>
                                <th class="py-3 px-3 text-left text-[11px] font-black tracking-[0.25em] uppercase text-gold">開催時間</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-white/5">
                            ${schedule.map((item) => `
                                <tr>
                                    <td class="py-3 px-3 text-base font-serif font-bold text-white whitespace-nowrap">${escapeHtml(item.week_label)}</td>
                                    <td class="py-3 px-3 text-sm text-gray-300 whitespace-nowrap">${escapeHtml(item.date_label)}</td>
                                    <td class="py-3 px-3 text-sm text-gray-400 whitespace-nowrap">${escapeHtml(item.time_label)}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
}

function renderSponsorshipSection(page) {
    const sponsorship = page.sponsorship;

    if (!sponsorship || !sponsorship.image) {
        return `
                <div class="jp-card p-5 md:p-6 corner-deco">
                    <p class="text-sm text-gray-400 leading-loose">本シーズンへの協賛はありません。</p>
                </div>
            `;
    }

    const imageMarkup = imageTag(
        sponsorship.image,
        sponsorship.alt || `${page.title} の協賛画像`,
        'w-full h-auto object-contain transition duration-500 group-hover:scale-[1.01]'
    );

    if (!sponsorship.href) {
        return `
                <figure class="jp-card p-4 md:p-6 corner-deco">
                    <div class="overflow-hidden rounded-sm border border-white/10 bg-black">
                        ${imageMarkup}
                    </div>
                </figure>
            `;
    }

    return `
            <a href="${escapeHtml(sponsorship.href)}" class="group block jp-card p-4 md:p-6 corner-deco hover:border-gold/40 transition-all duration-300">
                <div class="overflow-hidden rounded-sm border border-white/10 bg-black">
                    ${imageMarkup}
                </div>
            </a>
        `;
}

function renderCurrentFeature(page, isCurrent) {
    return `
            <article class="relative overflow-hidden rounded-sm border border-gold/30 bg-black">
                <div class="absolute inset-0">
                    ${imageTag(page.hero_image, page.title, 'w-full h-full object-cover opacity-25')}
                    <div class="absolute inset-0 bg-gradient-to-r from-black via-black/85 to-black/50"></div>
                    <div class="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(212,175,55,0.18),transparent_40%)]"></div>
                </div>
                <div class="relative z-10 px-6 py-10 md:px-10 md:py-14">
                    <div class="inline-flex flex-wrap gap-3 items-center mb-6">
                        <span class="border border-gold/30 px-3 py-1 text-[10px] font-black tracking-[0.45em] uppercase text-gold">${escapeHtml(page.season_label)}</span>
                        <span class="border border-white/10 px-3 py-1 text-[10px] font-black tracking-[0.35em] uppercase text-white/70">${escapeHtml(page.period_label)}</span>
                        ${isCurrent ? '<span class="border border-green-500/30 bg-green-500/10 px-3 py-1 text-[10px] font-black tracking-[0.35em] uppercase text-green-300">Current</span>' : ''}
                    </div>
                    <div class="max-w-3xl">
                        <h2 class="text-3xl md:text-5xl font-serif font-black text-white tracking-widest leading-tight mb-5">${escapeHtml(page.title)}</h2>
                        <p class="text-sm md:text-base text-gray-300 leading-loose mb-8">${escapeHtml(page.summary)}</p>
                        <div class="flex flex-col sm:flex-row gap-4">
                            <a href="${detailUrl(page.slug)}" class="inline-flex items-center justify-center gap-3 border border-gold/40 px-6 py-3 text-xs font-black tracking-[0.3em] uppercase text-gold hover:text-white hover:border-gold transition-all duration-300">
                                シーズン条件を見る <i class="fas fa-arrow-right"></i>
                            </a>
                            <a href="${escapeHtml(page.stats_link || pageHref('season_stats.html'))}" class="inline-flex items-center justify-center gap-3 border border-white/10 px-6 py-3 text-xs font-black tracking-[0.25em] uppercase text-white/80 hover:text-white hover:border-white/40 transition-all duration-300">
                                ランキングを見る <i class="fas fa-chart-line"></i>
                            </a>
                        </div>
                    </div>
                </div>
            </article>
        `;
}

// ---- 一覧（hub）の本文ビルダ ----

function buildHubCurrent(cfg) {
    const pages = Array.isArray(cfg.pages) ? cfg.pages : [];
    const currentPage = pages.find((page) => page.slug === cfg.current_slug) || pages[0];
    if (!currentPage) return '';
    return renderCurrentFeature(currentPage, true);
}

function buildHubGrid(cfg) {
    const pages = Array.isArray(cfg.pages) ? cfg.pages : [];
    const currentPage = pages.find((page) => page.slug === cfg.current_slug) || pages[0];
    if (!currentPage) return '';

    const orderedPages = [
        currentPage,
        ...pages.filter((page) => page.slug !== currentPage.slug)
    ];

    return orderedPages.map((page) => `
            <article class="group jp-card overflow-hidden h-full">
                <a href="${detailUrl(page.slug)}" class="block h-full">
                    <div class="relative aspect-[4/3] overflow-hidden border-b border-white/5">
                        ${imageTag(page.thumbnail_image, page.title, 'w-full h-full object-cover opacity-80 group-hover:scale-105 transition duration-700')}
                        <div class="absolute inset-0 bg-gradient-to-t from-black via-black/35 to-transparent"></div>
                        <div class="absolute left-3 top-3 flex flex-wrap gap-2">
                            <span class="border border-gold/30 bg-black/60 px-2 py-1 text-[9px] font-black tracking-[0.28em] uppercase text-gold">${escapeHtml(page.season_label)}</span>
                            ${page.slug === cfg.current_slug ? '<span class="border border-green-500/30 bg-green-500/10 px-2 py-1 text-[9px] font-black tracking-[0.22em] uppercase text-green-300">Current</span>' : ''}
                        </div>
                    </div>
                    <div class="p-4 md:p-5 flex flex-col gap-3">
                        <div>
                            <div class="text-[9px] font-black tracking-[0.32em] uppercase text-white/35 mb-2">${escapeHtml(page.period_label)}</div>
                            <h3 class="text-lg md:text-xl font-serif font-black text-white leading-snug group-hover:text-gold transition-colors">${escapeHtml(page.title)}</h3>
                        </div>
                        <p class="text-xs text-gray-400 leading-relaxed">${escapeHtml(page.summary)}</p>
                        <div class="pt-1 flex items-center justify-between text-[11px] font-black tracking-[0.2em] uppercase text-gold">
                            <span>条件を見る</span>
                            <i class="fas fa-arrow-right transition-transform duration-300 group-hover:translate-x-1"></i>
                        </div>
                    </div>
                </a>
            </article>
        `).join('');
}

// ---- 詳細ページの本文ビルダ ----

function buildDetail(cfg, slug) {
    const pages = Array.isArray(cfg.pages) ? cfg.pages : [];
    const pageIndex = pages.findIndex((item) => item.slug === slug);
    const page = pageIndex >= 0 ? pages[pageIndex] : null;
    if (!page) {
        throw new Error(`slug "${slug}" のページ定義が見つかりません。`);
    }

    const previousSeasonPage = pageIndex >= 0 && pageIndex < pages.length - 1 ? pages[pageIndex + 1] : null;
    const nextSeasonPage = pageIndex > 0 ? pages[pageIndex - 1] : null;

    const promotionMarkup = renderBlockList(
        page.promotion_blocks,
        'このシーズンでは昇格条件の記載はありません。',
        'fas fa-arrow-up',
        'border-gold/40 bg-gold/10 text-gold'
    );

    const relegationMarkup = renderBlockList(
        page.relegation_blocks,
        'このシーズンでは降格条件の記載はありません。',
        'fas fa-arrow-down',
        'border-red-900/40 bg-red-950/30 text-red-300'
    );

    const extraRuleMarkup = Array.isArray(page.extra_rules) && page.extra_rules.length > 0
        ? page.extra_rules.map((rule) => `
                <article class="border border-white/10 bg-white/5 px-5 py-5 rounded-sm">
                    <div class="text-[10px] font-black tracking-[0.35em] uppercase text-gold/60 mb-2">Supplement</div>
                    <h3 class="text-lg font-serif font-black text-white mb-3">${escapeHtml(rule.title)}</h3>
                    <p class="text-sm text-gray-400 leading-loose">${textToHtml(rule.body)}</p>
                </article>
            `).join('')
        : `
            <div class="jp-card p-8 md:p-10 corner-deco text-center">
                <i class="fas fa-exclamation-triangle text-2xl text-gold mb-4"></i>
                <p class="text-sm text-gray-300 leading-loose">補足ルールの記載はまだありません。</p>
            </div>
        `;
    const promotionHeading = page.promotion_heading || '昇格条件';
    const relegationHeading = page.relegation_heading || '降格条件';
    const descriptionMarkup = page.description
        ? `<p>${textToHtml(page.description)}</p>`
        : '';

    const highlightMarkup = page.highlight
        ? `
            <section class="mb-12 md:mb-16">
                <div class="relative overflow-hidden rounded-sm border border-gold/40 bg-gradient-to-br from-[#1a1305] to-black p-8 md:p-12 text-center">
                    <div class="absolute -right-8 -bottom-10 opacity-[0.06] pointer-events-none"><i class="fas fa-feather text-[200px] text-gold"></i></div>
                    <div class="relative z-10">
                        ${page.highlight.eyebrow ? `<div class="text-[10px] font-black tracking-[0.45em] uppercase text-gold/70 mb-5">${escapeHtml(page.highlight.eyebrow)}</div>` : ''}
                        <h2 class="text-2xl md:text-4xl font-serif font-black text-white leading-snug mb-4">${escapeHtml(page.highlight.lead)}</h2>
                        ${page.highlight.body ? `<p class="text-sm md:text-lg text-gray-300 leading-loose max-w-2xl mx-auto">${escapeHtml(page.highlight.body)}</p>` : ''}
                    </div>
                </div>
            </section>`
        : '';

    return `
            <section class="mb-12 md:mb-16">
                <article class="relative overflow-hidden rounded-sm border border-gold/25 bg-black">
                    <div class="absolute inset-0">
                        ${imageTag(page.hero_image, page.title, 'w-full h-full object-cover opacity-30')}
                        <div class="absolute inset-0 bg-gradient-to-r from-black via-black/90 to-black/55"></div>
                        <div class="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(212,175,55,0.18),transparent_42%)]"></div>
                    </div>
                    <div class="relative z-10 px-6 py-12 md:px-12 md:py-16">
                        <div class="inline-flex flex-wrap gap-3 items-center mb-6">
                            <span class="border border-gold/30 px-3 py-1 text-[10px] font-black tracking-[0.45em] uppercase text-gold">${escapeHtml(page.season_label)}</span>
                            <span class="border border-white/10 px-3 py-1 text-[10px] font-black tracking-[0.35em] uppercase text-white/70">${escapeHtml(page.period_label)}</span>
                        </div>
                        <div class="max-w-3xl">
                            <h1 class="text-3xl md:text-5xl font-serif font-black text-white tracking-widest leading-tight mb-6">${escapeHtml(page.title)}</h1>
                            <p class="text-sm md:text-base text-gray-300 leading-loose mb-8">${escapeHtml(page.summary)}</p>
                            <div class="flex flex-col sm:flex-row gap-4">
                                <a href="${pageHref('season-rules.html')}" class="inline-flex items-center justify-center gap-3 border border-white/10 px-6 py-3 text-xs font-black tracking-[0.25em] uppercase text-white/80 hover:text-white hover:border-white/40 transition-all duration-300">
                                    シーズン条件一覧へ戻る <i class="fas fa-layer-group"></i>
                                </a>
                                <a href="${escapeHtml(page.stats_link || pageHref('season_stats.html'))}" class="inline-flex items-center justify-center gap-3 border border-gold/40 px-6 py-3 text-xs font-black tracking-[0.25em] uppercase text-gold hover:text-white hover:border-gold transition-all duration-300">
                                    ランキングを見る <i class="fas fa-chart-line"></i>
                                </a>
                            </div>
                        </div>
                    </div>
                </article>
            </section>
${highlightMarkup}
            <section class="mb-12 md:mb-16">
                <div class="jp-card p-6 md:p-8 corner-deco">
                    <div class="flex items-center gap-3 mb-6">
                        <i class="fas fa-scroll text-gold text-lg"></i>
                        <h2 class="text-lg md:text-xl font-serif font-bold text-white">制度概要</h2>
                    </div>
                    <div class="space-y-5 text-sm md:text-base text-gray-300 leading-loose">
                        <p>${textToHtml(page.overview || page.summary)}</p>
                        ${descriptionMarkup}
                    </div>
                </div>
            </section>

            <section class="mb-12 md:mb-16">
                <div class="flex items-center gap-3 mb-6">
                    <i class="fas fa-sitemap text-gold"></i>
                    <h2 class="text-lg md:text-xl font-serif font-bold text-white">制度図解</h2>
                </div>
                <figure class="jp-card p-4 md:p-6 corner-deco">
                    <div class="overflow-hidden rounded-sm border border-white/10 bg-black">
                        ${imageTag(page.diagram_image, page.diagram_caption || page.title, 'w-full h-auto object-cover')}
                    </div>
                    ${page.diagram_caption ? `<figcaption class="text-xs text-gray-500 tracking-[0.2em] uppercase mt-4">${escapeHtml(page.diagram_caption)}</figcaption>` : ''}
                </figure>
            </section>

            <section class="mb-12 md:mb-16">
                <div class="flex items-center gap-3 mb-6">
                    <i class="fas fa-arrow-up text-gold"></i>
                    <h2 class="text-2xl md:text-3xl font-serif font-bold text-white">${escapeHtml(promotionHeading)}</h2>
                </div>
                <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    ${promotionMarkup}
                </div>
            </section>

            <section class="mb-12 md:mb-16">
                <div class="flex items-center gap-3 mb-6">
                    <i class="fas fa-arrow-down text-gold"></i>
                    <h2 class="text-2xl md:text-3xl font-serif font-bold text-white">${escapeHtml(relegationHeading)}</h2>
                </div>
                <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    ${relegationMarkup}
                </div>
            </section>

            <section class="mb-12 md:mb-16">
                <div class="flex items-center gap-3 mb-6">
                    <i class="fas fa-list text-gold"></i>
                    <h2 class="text-lg md:text-xl font-serif font-bold text-white">補足ルール</h2>
                </div>
                <div class="grid grid-cols-1 lg:grid-cols-3 gap-5">
                    ${extraRuleMarkup}
                </div>
            </section>

            <section class="mb-12 md:mb-16">
                <div class="flex items-center gap-3 mb-6">
                    <i class="fas fa-calendar-days text-gold"></i>
                    <h2 class="text-lg md:text-xl font-serif font-bold text-white">シーズンスケジュール</h2>
                </div>
                ${renderScheduleTable(page)}
            </section>

            <section class="mb-12 md:mb-16">
                <div class="flex items-center gap-3 mb-6">
                    <i class="fas fa-handshake text-gold"></i>
                    <h2 class="text-lg md:text-xl font-serif font-bold text-white">協賛内容</h2>
                </div>
                ${renderSponsorshipSection(page)}
            </section>

            <section class="mb-12 md:mb-16">
                <div class="flex items-center gap-3 mb-6">
                    <i class="fas fa-arrow-right-arrow-left text-gold"></i>
                    <h2 class="text-lg md:text-xl font-serif font-bold text-white">season切り替え</h2>
                </div>
                <div class="grid grid-cols-1 lg:grid-cols-2 gap-5">
                    ${renderSeasonSwitchButton({
                        label: 'Prev Season',
                        title: previousSeasonPage ? previousSeasonPage.season_label : '前シーズンなし',
                        description: previousSeasonPage
                            ? `${previousSeasonPage.season_label} のシーズン条件へ移動します。`
                            : 'このページより前のシーズン条件ページはありません。',
                        href: previousSeasonPage ? detailUrl(previousSeasonPage.slug) : null,
                        iconClass: 'fas fa-arrow-left',
                        muted: !previousSeasonPage
                    })}
                    ${renderSeasonSwitchButton({
                        label: 'Next Season',
                        title: nextSeasonPage ? nextSeasonPage.season_label : '次シーズンなし',
                        description: nextSeasonPage
                            ? `${nextSeasonPage.season_label} のシーズン条件へ移動します。`
                            : 'このページより次のシーズン条件ページはありません。',
                        href: nextSeasonPage ? detailUrl(nextSeasonPage.slug) : null,
                        iconClass: 'fas fa-arrow-right',
                        muted: !nextSeasonPage
                    })}
                </div>
            </section>

            <section>
                <div class="jp-card p-6 md:p-8 corner-deco">
                    <div class="flex items-center gap-3 mb-6">
                        <i class="fas fa-link text-gold"></i>
                        <h2 class="text-lg font-serif font-bold text-white">関連リンク</h2>
                    </div>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        ${renderRelatedLinkCard({
                            eyebrow: 'Hub',
                            title: 'シーズン条件一覧',
                            description: '全シーズンの条件ページと現在シーズンの導線をまとめて確認できます。',
                            href: pageHref('season-rules.html'),
                            iconClass: 'fas fa-layer-group'
                        })}
                        ${renderRelatedLinkCard({
                            eyebrow: 'Stats',
                            title: 'シーズンランキング',
                            description: '実際の順位とスタッツを見ながら制度条件を確認できます。',
                            href: page.stats_link || pageHref('season_stats.html'),
                            iconClass: 'fas fa-chart-line'
                        })}
                    </div>
                </div>
            </section>
        `;
}

// ---- ページ全体テンプレート ----

const GENERATED_NOTE = '<!-- GENERATED by scripts/build-season-rules.js — このファイルは自動生成です。編集は config/season_rule_pages.json で行い、再生成してください。 -->';
const REDIRECT_SCRIPT = `<script>if(location.hostname==='seekerstart-hp.vercel.app')location.replace('https://www.seekerstart.com/houou/'+location.pathname.slice(1)+location.search+location.hash);</script>`;
const FOOTER = `    <footer class="bg-[#050505] py-12 border-t border-white/5">
        <div class="container mx-auto px-6 text-center">
            <div class="flex items-center justify-center gap-4 mb-6">
                <img src="images/SeekerStart_logo.png" alt="Logo" class="h-6 w-auto" onerror="this.src='https://via.placeholder.com/80x30/111/d4af37?text=Logo'">
                <span class="text-base font-serif font-black tracking-[0.2em] text-white">ポーカー鳳凰戦</span>
            </div>
            <p class="text-gray-600 text-[10px] mb-6">
                Seeker Start 運営による公式シーズン制度ページ
            </p>
            <div class="text-[9px] text-gray-700 font-bold uppercase tracking-[0.4em]">
                &copy; 2026 POKER HOUOU LEAGUE. ALL RIGHTS RESERVED.
            </div>
        </div>
    </footer>`;

function htmlHead(title, canonical, description) {
    return `<!DOCTYPE html>
<html lang="ja" class="scroll-smooth">
<head>
    <meta charset="UTF-8">
    <link rel="icon" href="images/favicon.png" type="image/png">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(title)}</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css" rel="stylesheet">
    <link rel="stylesheet" href="css/style.css">
    <link rel="canonical" href="${escapeHtml(canonical)}">
    <meta name="description" content="${escapeHtml(description)}">
    ${REDIRECT_SCRIPT}
</head>`;
}

function detailPageHtml(cfg, page) {
    const canonical = `https://www.seekerstart.com/houou/season-rules-${page.slug}.html`;
    const description = page.meta_description || page.summary || '';
    return `${htmlHead(`${page.title} | ポーカー鳳凰戦`, canonical, description)}
${GENERATED_NOTE}
<body class="antialiased">

    <div id="site-header"></div>

    <main class="pt-32 pb-24 min-h-screen">
        <div class="container mx-auto px-6 max-w-6xl">
            <div id="season-rule-detail">${buildDetail(cfg, page.slug)}</div>
        </div>
    </main>

${FOOTER}

    <script src="js/header.js"></script>
</body>
</html>
`;
}

function hubPageHtml(cfg) {
    const title = 'シーズン条件一覧 | ポーカー鳳凰戦';
    const canonical = 'https://www.seekerstart.com/houou/season-rules.html';
    const description = cfg.hub_meta_description
        || 'ポーカー鳳凰戦の各シーズン条件をまとめた一覧ページです。現在シーズンの条件と、条件アーカイブへアクセスできます。';
    return `${htmlHead(title, canonical, description)}
${GENERATED_NOTE}
<body class="antialiased">

    <div id="site-header"></div>

    <main class="pt-32 pb-24 min-h-screen">
        <div class="container mx-auto px-6 max-w-6xl">
            <section class="text-center mb-14 md:mb-16">
                <div class="inline-block px-4 py-1 border border-gold/30 mb-6">
                    <span class="text-gold text-[9px] font-bold tracking-[0.5em] uppercase">Season Rules</span>
                </div>
                <h1 class="text-3xl md:text-5xl font-serif font-black text-white mb-6 tracking-widest">
                    シーズン条件<span class="gold-gradient">一覧</span>
                </h1>
                <p class="text-sm text-gray-400 max-w-3xl mx-auto leading-loose">
                    各シーズンの昇格・降格・認定条件をまとめた一覧ページです。
                    今シーズンの条件を最優先で確認でき、過去シーズンの条件ページもアーカイブとして確認できます。
                </p>
            </section>

            <section class="mb-16">
                <div id="season-rules-current">${buildHubCurrent(cfg)}</div>
            </section>

            <section class="mb-16">
                <div class="jp-card p-6 md:p-8 corner-deco">
                    <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
                        <div>
                            <div class="text-[10px] font-black tracking-[0.45em] uppercase text-gold/60 mb-3">Live Data</div>
                            <h2 class="text-2xl font-serif font-black text-white mb-3">ランキングページとあわせて確認</h2>
                            <p class="text-sm text-gray-400 leading-loose max-w-2xl">
                                制度ページはルールの原本、ランキングページはシーズンの実績確認用です。
                                昇格ラインや認定条件を把握したうえで、現在の順位やスタッツを確認できます。
                            </p>
                        </div>
                        <a href="/houou/season_stats.html" class="inline-flex items-center justify-center gap-3 border border-gold/40 px-6 py-3 text-xs font-black tracking-[0.3em] uppercase text-gold hover:text-white hover:border-gold transition-all duration-300">
                            ランキングを見る <i class="fas fa-arrow-right"></i>
                        </a>
                    </div>
                </div>
            </section>

            <section>
                <div class="flex items-center justify-between gap-4 mb-6">
                    <div>
                        <div class="text-[10px] font-black tracking-[0.45em] uppercase text-white/35 mb-2">Archive</div>
                        <h2 class="text-2xl md:text-3xl font-serif font-black text-white">シーズン条件アーカイブ</h2>
                    </div>
                    <div class="text-[10px] font-black tracking-[0.35em] uppercase text-gray-500">Season by Season</div>
                </div>
                <div id="season-rules-grid" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-5">${buildHubGrid(cfg)}</div>
            </section>
        </div>
    </main>

${FOOTER}

    <script src="js/header.js"></script>
</body>
</html>
`;
}

// ---- 出力 ----

function write(file, content) {
    const out = path.join(ROOT, file);
    fs.writeFileSync(out, content, 'utf8');
    console.log(`  generated: ${file}`);
}

function main() {
    const pages = Array.isArray(config.pages) ? config.pages : [];
    console.log('Building season-rules static pages from config/season_rule_pages.json ...');
    write('season-rules.html', hubPageHtml(config));
    for (const page of pages) {
        write(`season-rules-${page.slug}.html`, detailPageHtml(config, page));
    }
    console.log(`Done. ${pages.length + 1} files generated.`);
}

main();
