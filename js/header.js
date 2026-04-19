// Shared Header — single source of truth for all pages
(function () {
    const site = window.SiteConfig;
    const NAV_ITEMS = [
        { label: 'トップ', href: site.pageUrl('') },
        { label: 'ランキング', href: site.pageUrl('season_stats.html') },
        { label: 'シーズン制度', href: site.pageUrl('season-rules.html') },
        { label: '注目選手', href: site.pageUrl('pickup.html') },
        { label: '協賛一覧', href: site.pageUrl('sponsor.html') },
    ];

    const CTA = { label: '参戦申込', href: 'https://x.com/seekerstart' };

    function buildDesktopNav() {
        return NAV_ITEMS.map(item =>
            `<a href="${item.href}" class="nav-link-glow hover:text-white">${item.label}</a>`
        ).join('\n');
    }

    function buildMobileNav() {
        return NAV_ITEMS.map(item =>
            `<a href="${item.href}" class="text-2xl font-serif text-white tracking-widest hover:text-gold transition">${item.label}</a>`
        ).join('\n');
    }

    function render() {
        const target = document.getElementById('site-header');
        if (!target) return;

        target.innerHTML = `
        <header id="nav" class="fixed w-full z-[100] bg-black/90 backdrop-blur-md border-b border-white/5 transition-all duration-500">
            <div class="container mx-auto px-4 sm:px-6 lg:px-10 py-4 flex justify-between items-center">
                <!-- Logo -->
                <a href="${site.pageUrl('')}" class="flex items-center gap-3 sm:gap-4 md:gap-5">
                    <div class="bg-white/10 p-1 rounded shrink-0">
                        <img src="${site.assetUrl('images/SeekerStart_logo.png')}" alt="Logo" class="h-7 sm:h-8 md:h-9 w-auto" onerror="this.src='https://via.placeholder.com/100x40/111/d4af37?text=SS'">
                    </div>
                    <div class="h-5 sm:h-6 w-[1px] bg-white/20 hidden xs:block"></div>
                    <span class="text-sm sm:text-base md:text-lg lg:text-xl font-serif font-black tracking-[0.15em] sm:tracking-[0.2em] text-white whitespace-nowrap uppercase">
                        ポーカー鳳凰戦
                    </span>
                </a>

                <!-- Desktop Nav -->
                <nav class="hidden lg:flex items-center gap-6 xl:gap-10 text-xs xl:text-sm font-bold tracking-[0.15em] xl:tracking-[0.2em] uppercase text-white/60">
                    ${buildDesktopNav()}
                </nav>

                <!-- Action Buttons -->
                <div class="flex items-center gap-3 sm:gap-4">
                    <a href="${CTA.href}" target="_blank" rel="noopener" class="hidden sm:block border border-gold/40 text-gold px-5 md:px-6 lg:px-10 py-2.5 text-xs font-black tracking-widest nav-button-glow whitespace-nowrap uppercase">
                        ${CTA.label}
                    </a>
                    <button id="menu-toggle" class="lg:hidden text-white p-2 focus:outline-none" aria-label="Menu">
                        <i class="fas fa-bars text-xl sm:text-2xl"></i>
                    </button>
                </div>
            </div>
        </header>

        <!-- Mobile Nav Overlay -->
        <div id="mobile-menu" class="fixed inset-0 bg-black/98 z-[110] flex flex-col items-center justify-center gap-8 px-6">
            <button id="menu-close" class="absolute top-6 right-6 text-white text-3xl focus:outline-none">
                <i class="fas fa-times"></i>
            </button>
            <div class="flex flex-col items-center gap-6">
                ${buildMobileNav()}
            </div>
            <a href="${CTA.href}" target="_blank" rel="noopener" class="mt-4 border border-gold text-gold px-12 py-5 text-sm font-black tracking-[0.3em] uppercase">
                ${CTA.label}
            </a>
        </div>`;

        // Mobile menu toggle
        var menuToggle = document.getElementById('menu-toggle');
        var menuClose = document.getElementById('menu-close');
        var mobileMenu = document.getElementById('mobile-menu');

        menuToggle.addEventListener('click', function () {
            mobileMenu.classList.add('open');
            document.body.style.overflow = 'hidden';
        });

        menuClose.addEventListener('click', function () {
            mobileMenu.classList.remove('open');
            document.body.style.overflow = '';
        });

        mobileMenu.querySelectorAll('a').forEach(function (link) {
            link.addEventListener('click', function () {
                mobileMenu.classList.remove('open');
                document.body.style.overflow = '';
            });
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', render);
    } else {
        render();
    }
})();
