(function () {
    const CONFIG_PATH = 'config/season_rule_pages.json';

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
        return `season-rules-${slug}.html`;
    }

    function imageTag(src, alt, className) {
        return `<img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" class="${className}" onerror="this.src='https://images.unsplash.com/photo-1518893063132-36e46dbe2428?auto=format&fit=crop&q=80&w=1200'">`;
    }

    function loadingMarkup() {
        return `
            <div class="py-16 text-center text-gray-500">
                <i class="fas fa-spinner fa-spin text-2xl mb-4 block text-gold/60"></i>
                読み込み中です...
            </div>
        `;
    }

    function errorMarkup(message) {
        return `
            <div class="jp-card p-8 md:p-10 corner-deco text-center">
                <i class="fas fa-exclamation-triangle text-2xl text-gold mb-4"></i>
                <p class="text-sm text-gray-300 leading-loose">${textToHtml(message)}</p>
            </div>
        `;
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
                                制度詳細を見る <i class="fas fa-arrow-right"></i>
                            </a>
                            <a href="${escapeHtml(page.stats_link || 'season_stats.html')}" class="inline-flex items-center justify-center gap-3 border border-white/10 px-6 py-3 text-xs font-black tracking-[0.25em] uppercase text-white/80 hover:text-white hover:border-white/40 transition-all duration-300">
                                ランキングを見る <i class="fas fa-chart-line"></i>
                            </a>
                        </div>
                    </div>
                </div>
            </article>
        `;
    }

    function renderHub(config) {
        const currentTarget = document.getElementById('season-rules-current');
        const archiveTarget = document.getElementById('season-rules-grid');

        if (!currentTarget || !archiveTarget) return;

        const pages = Array.isArray(config.pages) ? config.pages : [];
        const currentPage = pages.find((page) => page.slug === config.current_slug) || pages[0];

        if (!currentPage) {
            currentTarget.innerHTML = errorMarkup('制度ページの設定がまだありません。');
            archiveTarget.innerHTML = '';
            return;
        }

        currentTarget.innerHTML = renderCurrentFeature(currentPage, true);

        const orderedPages = [
            currentPage,
            ...pages.filter((page) => page.slug !== currentPage.slug)
        ];

        archiveTarget.innerHTML = orderedPages.map((page) => `
            <article class="group jp-card overflow-hidden h-full">
                <a href="${detailUrl(page.slug)}" class="block h-full">
                    <div class="relative aspect-[4/3] overflow-hidden border-b border-white/5">
                        ${imageTag(page.thumbnail_image, page.title, 'w-full h-full object-cover opacity-80 group-hover:scale-105 transition duration-700')}
                        <div class="absolute inset-0 bg-gradient-to-t from-black via-black/35 to-transparent"></div>
                        <div class="absolute left-3 top-3 flex flex-wrap gap-2">
                            <span class="border border-gold/30 bg-black/60 px-2 py-1 text-[9px] font-black tracking-[0.28em] uppercase text-gold">${escapeHtml(page.season_label)}</span>
                            ${page.slug === config.current_slug ? '<span class="border border-green-500/30 bg-green-500/10 px-2 py-1 text-[9px] font-black tracking-[0.22em] uppercase text-green-300">Current</span>' : ''}
                        </div>
                    </div>
                    <div class="p-4 md:p-5 flex flex-col gap-3">
                        <div>
                            <div class="text-[9px] font-black tracking-[0.32em] uppercase text-white/35 mb-2">${escapeHtml(page.period_label)}</div>
                            <h3 class="text-lg md:text-xl font-serif font-black text-white leading-snug group-hover:text-gold transition-colors">${escapeHtml(page.title)}</h3>
                        </div>
                        <p class="text-xs text-gray-400 leading-relaxed">${escapeHtml(page.summary)}</p>
                        <div class="pt-1 flex items-center justify-between text-[11px] font-black tracking-[0.2em] uppercase text-gold">
                            <span>詳細を見る</span>
                            <i class="fas fa-arrow-right transition-transform duration-300 group-hover:translate-x-1"></i>
                        </div>
                    </div>
                </a>
            </article>
        `).join('');
    }

    function renderDetail(config, slug) {
        const target = document.getElementById('season-rule-detail');
        if (!target) return;

        const pages = Array.isArray(config.pages) ? config.pages : [];
        const pageIndex = pages.findIndex((item) => item.slug === slug);
        const page = pageIndex >= 0 ? pages[pageIndex] : null;
        if (!page) {
            target.innerHTML = errorMarkup('指定されたシーズン制度ページが見つかりませんでした。');
            return;
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
            : errorMarkup('補足ルールの記載はまだありません。');
        const promotionHeading = page.promotion_heading || '昇格条件';
        const relegationHeading = page.relegation_heading || '降格条件';

        target.innerHTML = `
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
                                <a href="season-rules.html" class="inline-flex items-center justify-center gap-3 border border-white/10 px-6 py-3 text-xs font-black tracking-[0.25em] uppercase text-white/80 hover:text-white hover:border-white/40 transition-all duration-300">
                                    制度一覧へ戻る <i class="fas fa-layer-group"></i>
                                </a>
                                <a href="${escapeHtml(page.stats_link || 'season_stats.html')}" class="inline-flex items-center justify-center gap-3 border border-gold/40 px-6 py-3 text-xs font-black tracking-[0.25em] uppercase text-gold hover:text-white hover:border-gold transition-all duration-300">
                                    ランキングを見る <i class="fas fa-chart-line"></i>
                                </a>
                            </div>
                        </div>
                    </div>
                </article>
            </section>

            <section class="mb-12 md:mb-16">
                <div class="jp-card p-6 md:p-8 corner-deco">
                    <div class="flex items-center gap-3 mb-6">
                        <i class="fas fa-scroll text-gold text-lg"></i>
                        <h2 class="text-lg md:text-xl font-serif font-bold text-white">制度概要</h2>
                    </div>
                    <div class="space-y-5 text-sm md:text-base text-gray-300 leading-loose">
                        <p>${textToHtml(page.overview || page.summary)}</p>
                        <p>${textToHtml(page.description)}</p>
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

            <section>
                <div class="jp-card p-6 md:p-8 corner-deco">
                    <div class="flex items-center gap-3 mb-6">
                        <i class="fas fa-link text-gold"></i>
                        <h2 class="text-lg font-serif font-bold text-white">関連リンク</h2>
                    </div>
                    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        ${renderRelatedLinkCard({
                            eyebrow: 'Prev',
                            title: previousSeasonPage ? '前シーズンガイド' : '前シーズンなし',
                            description: previousSeasonPage
                                ? `${previousSeasonPage.season_label} の制度ガイドへ移動します。`
                                : 'このページより前のシーズンガイドはありません。',
                            href: previousSeasonPage ? detailUrl(previousSeasonPage.slug) : null,
                            iconClass: 'fas fa-arrow-left',
                            muted: !previousSeasonPage
                        })}
                        ${renderRelatedLinkCard({
                            eyebrow: 'Next',
                            title: nextSeasonPage ? '次シーズンガイド' : '次シーズンなし',
                            description: nextSeasonPage
                                ? `${nextSeasonPage.season_label} の制度ガイドへ移動します。`
                                : 'このページより次のシーズンガイドはありません。',
                            href: nextSeasonPage ? detailUrl(nextSeasonPage.slug) : null,
                            iconClass: 'fas fa-arrow-right',
                            muted: !nextSeasonPage
                        })}
                        ${renderRelatedLinkCard({
                            eyebrow: 'Hub',
                            title: '制度一覧ページ',
                            description: '全シーズンの制度ページと現在シーズンの導線をまとめて確認できます。',
                            href: 'season-rules.html',
                            iconClass: 'fas fa-layer-group'
                        })}
                        ${renderRelatedLinkCard({
                            eyebrow: 'Stats',
                            title: 'シーズンランキング',
                            description: '実際の順位とスタッツを見ながら制度条件を確認できます。',
                            href: page.stats_link || 'season_stats.html',
                            iconClass: 'fas fa-chart-line'
                        })}
                    </div>
                </div>
            </section>
        `;
    }

    async function loadConfig() {
        const response = await fetch(CONFIG_PATH);
        if (!response.ok) {
            throw new Error('season_rule_pages.json の読み込みに失敗しました。');
        }
        return response.json();
    }

    async function init() {
        const mode = document.body.dataset.pageMode;
        if (!mode) return;

        const hubTarget = document.getElementById('season-rules-current');
        const detailTarget = document.getElementById('season-rule-detail');

        if (hubTarget) hubTarget.innerHTML = loadingMarkup();
        if (detailTarget) detailTarget.innerHTML = loadingMarkup();

        try {
            const config = await loadConfig();

            if (mode === 'season-rules-index') {
                renderHub(config);
                return;
            }

            if (mode === 'season-rules-detail') {
                renderDetail(config, document.body.dataset.seasonRuleSlug);
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : '制度ページの読み込みに失敗しました。';

            if (hubTarget) hubTarget.innerHTML = errorMarkup(message);
            if (detailTarget) detailTarget.innerHTML = errorMarkup(message);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
