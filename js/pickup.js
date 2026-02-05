/**
 * 注目選手ページ用のJavaScript
 * - JSONからデータを読み込み
 * - 選手カードのレンダリング
 * - シーズンタブの制御
 */

// 定数
const CONFIG = {
    MAX_FEATURED: 5,
    PLAYER_ICON_SIZE: 218,
    DATA_PATH: 'config/featured_players.json'
};

const CSS_CLASSES = {
    CONTENT_TEXT: 'text-[15.6px] text-gray-300 leading-snug',
    SECTION_LABEL: 'text-[10.8px] text-gold/70 tracking-[0.5em] uppercase mb-2',
    BOX: 'border border-white/15 bg-white/5 px-4 py-3',
    COMMENT_BOX: 'border border-gold/30 bg-black/70 rounded px-5 py-4 shadow-[0_0_18px_rgba(212,175,55,0.15)]',
    PLAYER_CARD: 'jp-card p-6 corner-deco reveal active relative group'
};

// DOM要素
let seasonTabs = null;
let featuredList = null;

/**
 * リンクが有効かどうかを判定
 */
function isEnabledLink(url) {
    return url && url !== '#' && url !== null;
}

/**
 * ソーシャルアイコンのHTMLを生成
 */
function buildSocialIcons(player) {
    const social = player.social || {};
    const items = [
        { label: 'X', icon: 'fa-brands fa-twitter', url: social.x, color: '#38bdf8' },
        { label: 'YouTube', icon: 'fa-brands fa-youtube', url: social.youtube, color: '#ff0000' },
        { label: 'Instagram', icon: 'fa-brands fa-instagram', url: social.instagram, color: '#e1306c', gradient: ['#f58529', '#feda77', '#dd2a7b', '#8134af', '#515bd4'] },
        { label: 'TikTok', icon: 'fa-brands fa-tiktok', url: social.tiktok, color: '#25F4EE', gradient: ['#25F4EE', '#FE2C55'] },
        { label: 'note', icon: 'fa-solid fa-note-sticky', url: social.note, color: '#00c300' },
        { label: 'Website', icon: 'fa-solid fa-globe', url: social.website, color: '#d4af37' }
    ];

    return items.map((item) => {
        const enabled = isEnabledLink(item.url);
        const color = enabled ? item.color : '#6b7280';
        const border = enabled ? (item.gradient ? item.gradient[0] : item.color) : '#374151';
        const tag = enabled ? 'a' : 'span';
        const hrefAttr = enabled ? `href="${item.url}" target="_blank" rel="noopener"` : '';
        const gradientStops = item.gradient ? item.gradient.join(', ') : '';
        const iconStyle = enabled && item.gradient
            ? `style="background: linear-gradient(135deg, ${gradientStops}); -webkit-background-clip: text; background-clip: text; color: transparent; -webkit-text-fill-color: transparent;"`
            : `style="color:${color};"`;
        const iconMarkup = item.label === 'note'
            ? `<span class="text-[17px] font-black tracking-widest" style="color:${color};">N</span>`
            : `<i class="${item.icon} text-[19px]" ${iconStyle}></i>`;

        return `<${tag} ${hrefAttr} class="inline-flex items-center justify-center w-10 h-10 rounded border" style="color:${color}; border-color:${border};" aria-label="${item.label}">
            ${iconMarkup}
        </${tag}>`;
    }).join('');
}

/**
 * タグバッジのHTMLを生成
 */
function buildTagBadge(tag) {
    if (!tag) return '';

    if (tag === '配信者' || tag === '有名人' || tag === '著名人') {
        return `
            <div class="absolute top-4 left-4 z-20">
                <div class="relative px-5 py-2 rounded-md bg-black/80 border border-gold/60 backdrop-blur-sm">
                    <div class="absolute inset-1 rounded-[6px] border border-gold/30 bg-black/60"></div>
                    <div class="absolute -top-8 left-1/2 -translate-x-1/2 flex gap-2">
                        <span class="w-4 h-[2px] bg-gold/90 -rotate-[30deg]"></span>
                        <span class="w-4 h-[2px] bg-gold/90 rotate-[30deg]"></span>
                    </div>
                    <div class="absolute -bottom-6 left-1/2 -translate-x-1/2 w-12 h-[2px] bg-gold/70"></div>
                    <div class="absolute -bottom-9 left-1/2 -translate-x-1/2 w-6 h-[2px] bg-gold/40"></div>
                    <div class="relative z-10 text-[12px] font-black tracking-[0.3em] text-gold drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">${tag}</div>
                </div>
            </div>
        `;
    }

    return `
        <div class="absolute top-4 left-4 z-20">
            <div class="px-4 py-2 rounded-full text-center bg-black/80 border border-white/15 backdrop-blur-sm">
                <div class="text-[12px] font-black tracking-[0.3em] text-gold drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">${tag}</div>
            </div>
        </div>
    `;
}

/**
 * シーズンをソート（番号順）
 */
function sortSeasons(seasons) {
    return seasons
        .map((season, index) => ({ ...season, _order: index }))
        .sort((a, b) => {
            const getNumber = (value) => {
                const match = String(value || '').match(/(\d+)/);
                return match ? parseInt(match[1], 10) : null;
            };
            const aNumber = getNumber(a.id) ?? getNumber(a.label);
            const bNumber = getNumber(b.id) ?? getNumber(b.label);
            if (aNumber !== null && bNumber !== null && aNumber !== bNumber) {
                return aNumber - bNumber;
            }
            return a._order - b._order;
        });
}

/**
 * プレイヤーカードのHTMLを生成
 */
function createPlayerCard(player, extraClass = '') {
    const achievements = player.achievements || [];
    const achievementsHtml = achievements.slice(0, 3).map(item => `<li>${item}</li>`).join('');
    const hasStats = Boolean(player.bb || player.hands);
    const statsHtml = hasStats ? `
        <div class="flex flex-row flex-wrap gap-3 font-black tracking-[0.08em] uppercase ${CSS_CLASSES.CONTENT_TEXT}">
            ${player.bb ? `<span class="px-3 py-2 border border-white/15 bg-white/5 whitespace-nowrap">獲得BB数 ${player.bb}</span>` : ''}
            ${player.hands ? `<span class="px-3 py-2 border border-white/15 bg-white/5 whitespace-nowrap">プレイハンド ${player.hands}</span>` : ''}
        </div>
    ` : '';
    const quoteHtml = player.quote ? `
        <div class="mt-4">
            <div class="${CSS_CLASSES.SECTION_LABEL}">Player Comment</div>
            <div class="${CSS_CLASSES.COMMENT_BOX}">
                <p class="${CSS_CLASSES.CONTENT_TEXT}">${player.quote}</p>
            </div>
        </div>
    ` : '';
    const badge = buildTagBadge(player.tag);
    const cardClass = `${CSS_CLASSES.PLAYER_CARD} ${extraClass}`;
    const achievementsClass = `space-y-1 ${CSS_CLASSES.CONTENT_TEXT}`;

    return `
        <div class="${cardClass}">
            ${badge}
            <div class="flex flex-col lg:flex-row gap-6 lg:gap-10">
                <div class="flex flex-col items-center gap-5 lg:w-[45%]">
                    <div class="relative shrink-0 z-10" style="width:${CONFIG.PLAYER_ICON_SIZE}px;height:${CONFIG.PLAYER_ICON_SIZE}px;">
                        <div class="rounded-lg overflow-hidden border border-white/10 bg-white/5 w-full h-full">
                            <img src="${player.image}" alt="${player.name}" class="w-full h-full object-cover object-center" onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=&quot;http://www.w3.org/2000/svg&quot; width=&quot;160&quot; height=&quot;160&quot; viewBox=&quot;0 0 160 160&quot;><rect width=&quot;160&quot; height=&quot;160&quot; fill=&quot;#111&quot;/><text x=&quot;50%&quot; y=&quot;52%&quot; dominant-baseline=&quot;middle&quot; text-anchor=&quot;middle&quot; fill=&quot;#d4af37&quot; font-size=&quot;16&quot; font-family=&quot;Arial&quot;>Player</text></svg>'">
                        </div>
                    </div>
                    <div class="text-center">
                        <div class="text-gold text-[14.3px] tracking-[0.25em] uppercase">${player.alias}</div>
                        <div class="text-white font-serif font-black text-[26.4px]">${player.name}</div>
                    </div>
                </div>
                <div class="flex-1">
                    <div class="flex items-start justify-between gap-6">
                        <div class="flex-1">
                            <div class="${CSS_CLASSES.SECTION_LABEL}">主な実績</div>
                            <div class="${CSS_CLASSES.BOX}">
                                <ul class="${achievementsClass} list-disc pl-4">
                                    ${achievementsHtml}
                                </ul>
                            </div>
                            ${hasStats ? `
                                <div class="mt-3">
                                    <div class="${CSS_CLASSES.SECTION_LABEL}">シーズン結果</div>
                                    <div class="${CSS_CLASSES.BOX}">
                                        ${statsHtml}
                                    </div>
                                </div>
                            ` : ''}
                            ${quoteHtml}
                        </div>
                        <div class="flex flex-col items-center gap-3">
                            ${buildSocialIcons(player)}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

/**
 * プレイヤーリストをレンダリング
 */
function renderPlayers(container, players) {
    if (!container) return;
    const displayPlayers = (players || []).slice(0, CONFIG.MAX_FEATURED);
    if (displayPlayers.length === 0) {
        container.innerHTML = `
            <div class="jp-card p-6 border-dashed border-white/10 text-center text-gray-500 text-sm reveal active">
                準備中です。
            </div>
        `;
        return;
    }
    container.innerHTML = displayPlayers.map(player => createPlayerCard(player)).join('');
}

/**
 * アクティブなタブを設定
 */
function setActiveTab(activeId) {
    if (!seasonTabs) return;
    [...seasonTabs.querySelectorAll('button')].forEach(btn => {
        const isActive = btn.dataset.season === activeId;
        btn.classList.toggle('text-white', isActive);
        btn.classList.toggle('text-gray-400', !isActive);
        btn.classList.toggle('border-gold/60', isActive);
        btn.classList.toggle('border-white/10', !isActive);
    });
}

/**
 * シーズンをレンダリング
 */
function renderSeason(season) {
    renderPlayers(featuredList, season.featured);
    setActiveTab(season.id);
}

/**
 * JSONデータを読み込む
 */
async function loadFeaturedPlayers() {
    try {
        const response = await fetch(CONFIG.DATA_PATH);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.error('Failed to load featured players data:', error);
        return { seasons: [] };
    }
}

/**
 * 初期化
 */
async function init() {
    seasonTabs = document.getElementById('season-tabs');
    featuredList = document.getElementById('featured-list');

    if (!seasonTabs || !featuredList) return;

    const data = await loadFeaturedPlayers();
    const seasons = sortSeasons(data.seasons || []);

    if (seasons.length === 0) {
        renderPlayers(featuredList, []);
        return;
    }

    seasonTabs.innerHTML = seasons.map((season, index) => {
        const baseClass = 'px-4 py-2 border text-xs font-black tracking-[0.3em] uppercase transition';
        const activeClass = index === 0
            ? ' text-white border-gold/60'
            : ' text-gray-400 border-white/10 hover:text-white';
        return `<button class="${baseClass}${activeClass}" data-season="${season.id}">${season.label}</button>`;
    }).join('');

    seasonTabs.addEventListener('click', (event) => {
        const button = event.target.closest('button');
        if (!button) return;
        const seasonId = button.dataset.season;
        const season = seasons.find(item => item.id === seasonId);
        if (season) renderSeason(season);
    });

    renderSeason(seasons[0]);
}

document.addEventListener('DOMContentLoaded', init);
