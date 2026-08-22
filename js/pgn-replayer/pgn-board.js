(function (global) {
    'use strict';

    class PgnBoard {
        constructor(container, options = {}) {
            if (!container || typeof global.Chessboard !== 'function') throw new Error('Chessboard is unavailable.');
            this.container = container;
            this.orientation = options.orientation === 'black' ? 'black' : 'white';
            this.widget = global.Chessboard(container, {
                position: options.position || 'start',
                orientation: this.orientation,
                draggable: false,
                showNotation: true,
                pieceTheme: '/img/chesspieces/wikipedia/{piece}.png',
                appearSpeed: 'fast',
                moveSpeed: 'fast'
            });
            this.removeDetachedPieces();
            container.setAttribute('role', 'img');
            container.setAttribute('tabindex', '0');
            container.setAttribute('aria-label', 'Chess position. White orientation.');
            this.onResize = () => this.resize();
            global.addEventListener('resize', this.onResize, { passive: true });
        }

        setPosition(fen, move = null) {
            this.widget.position(fen || 'start', false);
            this.removeDetachedPieces();
            this.container.querySelectorAll('.caissa-pgn-last-move').forEach(node => node.classList.remove('caissa-pgn-last-move'));
            if (move?.from && move?.to) {
                this.container.querySelector(`.square-${move.from}`)?.classList.add('caissa-pgn-last-move');
                this.container.querySelector(`.square-${move.to}`)?.classList.add('caissa-pgn-last-move');
            }
        }

        flip() {
            this.orientation = this.orientation === 'white' ? 'black' : 'white';
            this.widget.orientation(this.orientation);
            this.container.setAttribute('aria-label', `Chess position. ${this.orientation} orientation.`);
            return this.orientation;
        }

        resize() { this.widget?.resize?.(); }
        removeDetachedPieces() {
            document.querySelectorAll('body.pgn-replayer-page > .piece-417db').forEach(piece => piece.remove());
        }
        destroy() {
            global.removeEventListener('resize', this.onResize);
            this.widget?.destroy?.();
        }
    }

    global.CaissaPgnBoard = Object.freeze({ create: (container, options) => new PgnBoard(container, options) });
})(window);
