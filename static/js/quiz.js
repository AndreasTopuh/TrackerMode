/**
 * TrackerMode v2 — Quiz System
 * Generates random quizzes to re-engage unfocused users.
 */

class QuizSystem {
    constructor() {
        this.overlay = document.getElementById('quiz-overlay');
        this.questionEl = document.getElementById('quiz-question');
        this.optionsEl = document.getElementById('quiz-options');
        this.roastEl = document.getElementById('quiz-roast');
        this.timerFill = document.getElementById('quiz-timer-fill');

        this.isShowing = false;
        this.quizCount = 0;
        this.correctCount = 0;
        this.timerInterval = null;
        this.currentAnswer = null;
        this.onComplete = null;

        this.roasts = [
            "Your brain went AFK. Prove you're still here! 🧠",
            "Caught you zoning out! Time for a brain check! ⚡",
            "Hello? Earth to you! Quick quiz incoming! 🌎",
            "Focus dropped below the minimum. Wake up! 🔔",
            "Your attention span just rage-quit. Fix it! 💀",
            "The algorithm noticed you slacking. Don't let it win! 🤖",
            "Quick! Prove to the AI you're still awake! 👁️",
            "Your future self is judging you right now... 👀",
            "Even your cursor is more active than you! 🖱️",
            "Snap out of it! This quiz is your redemption! 💪"
        ];
    }

    show() {
        if (this.isShowing) return;
        this.isShowing = true;
        this.quizCount++;

        const quiz = this._generateQuiz();
        this.currentAnswer = quiz.answer;

        this.roastEl.textContent = this.roasts[Math.floor(Math.random() * this.roasts.length)];
        this.questionEl.textContent = quiz.question;
        this.optionsEl.innerHTML = '';

        quiz.options.forEach(option => {
            const btn = document.createElement('button');
            btn.className = 'quiz-option';
            btn.textContent = option;
            btn.addEventListener('click', () => this._handleAnswer(btn, option));
            this.optionsEl.appendChild(btn);
        });

        this.overlay.classList.remove('hidden');

        // Timer countdown (15 seconds)
        this.timerFill.style.width = '100%';
        let remaining = 15;
        this.timerInterval = setInterval(() => {
            remaining -= 0.5;
            this.timerFill.style.width = `${(remaining / 15) * 100}%`;
            if (remaining <= 0) {
                this._timeout();
            }
        }, 500);
    }

    hide() {
        this.isShowing = false;
        this.overlay.classList.add('hidden');
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
    }

    getStats() {
        return {
            total: this.quizCount,
            correct: this.correctCount,
            accuracy: this.quizCount > 0 ? Math.round((this.correctCount / this.quizCount) * 100) : 0
        };
    }

    _handleAnswer(btn, selected) {
        const buttons = this.optionsEl.querySelectorAll('.quiz-option');
        buttons.forEach(b => b.style.pointerEvents = 'none');

        if (String(selected) === String(this.currentAnswer)) {
            btn.classList.add('correct');
            this.correctCount++;
            setTimeout(() => this.hide(), 800);
        } else {
            btn.classList.add('wrong');
            // Highlight correct answer
            buttons.forEach(b => {
                if (b.textContent === String(this.currentAnswer)) {
                    b.classList.add('correct');
                }
            });
            setTimeout(() => this.hide(), 1500);
        }

        if (this.timerInterval) {
            clearInterval(this.timerInterval);
        }

        if (this.onComplete) {
            this.onComplete(String(selected) === String(this.currentAnswer));
        }
    }

    _timeout() {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
        }
        // Auto-close and count as wrong
        const buttons = this.optionsEl.querySelectorAll('.quiz-option');
        buttons.forEach(b => {
            if (b.textContent === String(this.currentAnswer)) {
                b.classList.add('correct');
            }
        });

        setTimeout(() => this.hide(), 1500);

        if (this.onComplete) {
            this.onComplete(false);
        }
    }

    _generateQuiz() {
        const generators = [
            this._mathMultiply,
            this._mathAdd,
            this._mathSubtract,
            this._capitalQuiz,
            this._sequenceQuiz
        ];
        const gen = generators[Math.floor(Math.random() * generators.length)];
        return gen();
    }

    _mathMultiply() {
        const a = Math.floor(Math.random() * 12) + 2;
        const b = Math.floor(Math.random() * 12) + 2;
        const answer = a * b;
        const options = QuizSystem._shuffleOptions(answer, () => Math.floor(Math.random() * 144) + 4);
        return { question: `${a} × ${b} = ?`, answer, options };
    }

    _mathAdd() {
        const a = Math.floor(Math.random() * 90) + 10;
        const b = Math.floor(Math.random() * 90) + 10;
        const answer = a + b;
        const options = QuizSystem._shuffleOptions(answer, () => Math.floor(Math.random() * 180) + 20);
        return { question: `${a} + ${b} = ?`, answer, options };
    }

    _mathSubtract() {
        const a = Math.floor(Math.random() * 90) + 50;
        const b = Math.floor(Math.random() * 40) + 5;
        const answer = a - b;
        const options = QuizSystem._shuffleOptions(answer, () => Math.floor(Math.random() * 100) + 5);
        return { question: `${a} − ${b} = ?`, answer, options };
    }

    _capitalQuiz() {
        const capitals = [
            { country: 'Japan', capital: 'Tokyo', fakes: ['Seoul', 'Beijing', 'Bangkok'] },
            { country: 'France', capital: 'Paris', fakes: ['London', 'Berlin', 'Madrid'] },
            { country: 'Brazil', capital: 'Brasília', fakes: ['Rio de Janeiro', 'São Paulo', 'Lima'] },
            { country: 'Australia', capital: 'Canberra', fakes: ['Sydney', 'Melbourne', 'Perth'] },
            { country: 'Indonesia', capital: 'Jakarta', fakes: ['Bali', 'Surabaya', 'Bandung'] },
            { country: 'South Korea', capital: 'Seoul', fakes: ['Tokyo', 'Busan', 'Taipei'] },
            { country: 'Germany', capital: 'Berlin', fakes: ['Munich', 'Hamburg', 'Vienna'] },
            { country: 'Canada', capital: 'Ottawa', fakes: ['Toronto', 'Vancouver', 'Montreal'] },
            { country: 'Italy', capital: 'Rome', fakes: ['Milan', 'Venice', 'Florence'] },
            { country: 'Thailand', capital: 'Bangkok', fakes: ['Phuket', 'Chiang Mai', 'Hanoi'] }
        ];
        const q = capitals[Math.floor(Math.random() * capitals.length)];
        const options = [q.capital, ...q.fakes].sort(() => Math.random() - 0.5);
        return { question: `Capital of ${q.country}?`, answer: q.capital, options };
    }

    _sequenceQuiz() {
        const start = Math.floor(Math.random() * 15) + 2;
        const step = Math.floor(Math.random() * 5) + 2;
        const seq = [start, start + step, start + step * 2, start + step * 3];
        const answer = start + step * 4;
        const options = QuizSystem._shuffleOptions(answer, () => answer + Math.floor(Math.random() * 10) - 5);
        return { question: `${seq.join(', ')}, ?`, answer, options };
    }

    static _shuffleOptions(correct, faker) {
        const opts = new Set([correct]);
        let guard = 0;
        while (opts.size < 4 && guard < 100) {
            guard++;
            const fake = faker();
            if (fake !== correct && fake > 0) opts.add(fake);
        }
        // Fill remaining with offset values if guard hit
        while (opts.size < 4) {
            opts.add(correct + opts.size * 3);
        }
        return [...opts].sort(() => Math.random() - 0.5);
    }
}

// Export as global
window.QuizSystem = QuizSystem;
