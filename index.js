const TelegramBot = require('node-telegram-bot-api');

// Token du bot (sera défini dans les variables d'environnement Render)
const token = process.env.BOT_TOKEN;

if (!token) {
    console.error('❌ BOT_TOKEN manquant dans les variables d\'environnement!');
    process.exit(1);
}

const bot = new TelegramBot(token, {polling: true});

console.log('🤖 Bot Telegram démarré...');

// Fonctions d'analyse du baccarat
function extractSuits(cards) {
    return cards.map(card => {
        if (card.includes('♠️')) return '♠️';
        if (card.includes('♣️')) return '♣️';
        if (card.includes('♥️')) return '♥️';
        if (card.includes('♦️')) return '♦️';
        return null;
    }).filter(suit => suit !== null);
}

function parseResult(resultLine) {
    const numMatch = resultLine.match(/#(N\d+)/);
    const cardMatches = resultLine.match(/\(([^()]*)\)/g);
    
    const numero = numMatch ? numMatch[1] : null;
    const playerCards = cardMatches && cardMatches[0] ? 
        cardMatches[0].slice(1, -1).split(/\s+/).filter(card => card) : [];
    const dealerCards = cardMatches && cardMatches[1] ? 
        cardMatches[1].slice(1, -1).split(/\s+/).filter(card => card) : [];

    return {
        numero: numero,
        player: playerCards,
        dealer: dealerCards,
        dealerSuits: extractSuits(dealerCards),
        playerSuits: extractSuits(playerCards)
    };
}

function countOccurrences(arr) {
    const counter = {};
    for (const item of arr) {
        counter[item] = (counter[item] || 0) + 1;
    }
    return counter;
}

function getMostCommon(counter) {
    let maxCount = 0;
    let mostCommon = null;
    
    for (const [item, count] of Object.entries(counter)) {
        if (count > maxCount) {
            maxCount = count;
            mostCommon = item;
        }
    }
    
    return [mostCommon, maxCount];
}

function analyzeForTelegram(messageText) {
    try {
        const lines = messageText.split('\n').filter(line => line.trim());
        let specialIndex = -1;
        
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes('SPECIAL:')) {
                specialIndex = i;
                break;
            }
        }
        
        if (specialIndex === -1) {
            return `❌ Format incorrect!

📝 Utilisez ce format:
/analyze
#N501 (5♣️ K♠️) (4♦️ A♠️)
#N502 (7♥️ 2♠️) (9♠️ J♦️)
... (minimum 10 lignes)
SPECIAL: #N511 (Q♥️ 3♠️) (4♦️ A♠️)

💡 Le mot "SPECIAL:" indique le résultat à analyser.`;
        }
        
        const historicalLines = lines.slice(1, specialIndex);
        const specialLine = lines[specialIndex].replace('SPECIAL:', '').trim();
        
        if (historicalLines.length < 10) {
            return `❌ Pas assez de données!

Vous avez fourni: ${historicalLines.length} résultats
Minimum requis: 10 résultats

📝 Ajoutez plus de lignes avant "SPECIAL:"`;
        }
        
        const results = historicalLines.map(line => parseResult(line.trim()));
        const lastResult = parseResult(specialLine);
        const lastDealerSuits = lastResult.dealerSuits;
        
        if (!lastResult.numero) {
            return `❌ Résultat SPECIAL invalide!

Vérifiez le format de votre ligne SPECIAL:
Exemple: SPECIAL: #N511 (Q♥️ 3♠️) (4♦️ A♠️)`;
        }
        
        const sameDealerIndices = [];
        for (let i = 0; i < results.length - 1; i++) {
            if (JSON.stringify(results[i].dealerSuits) === JSON.stringify(lastDealerSuits)) {
                sameDealerIndices.push(i);
            }
        }
        
        if (sameDealerIndices.length === 0) {
            return `⚠️ Aucun pattern trouvé

📊 Données analysées: ${historicalLines.length} résultats
🎯 Pattern recherché: ${lastDealerSuits.join(' ')} 
🔍 Aucune correspondance trouvée

💡 Conseil: Essayez avec plus de données historiques pour augmenter les chances de trouver des patterns similaires.`;
        }
        
        const nextDealerSuits = [];
        let matchDetails = "";
        let matchCount = 0;
        
        for (const idx of sameDealerIndices) {
            if (idx + 1 < results.length) {
                const nextGameSuits = results[idx + 1].dealerSuits;
                nextDealerSuits.push(...nextGameSuits);
                matchCount++;
                matchDetails += `🔸 Match ${matchCount}: ${results[idx + 1].dealer.join(' ')} → ${nextGameSuits.join(' ')}\n`;
            }
        }
        
        if (nextDealerSuits.length === 0) {
            return "❌ Aucune donnée trouvée après les matchs identifiés.";
        }
        
        const counter = countOccurrences(nextDealerSuits);
        const [mostCommonSuit, count] = getMostCommon(counter);
        const percentage = Math.round(count/nextDealerSuits.length*100);
        
        let response = `✅ PRÉDICTION TROUVÉE!\n\n`;
        response += `🎯 Pour le jeu ${lastResult.numero}+1:\n`;
        response += `🃏 Couleur prédite: ${mostCommonSuit}\n`;
        response += `📈 Niveau de confiance: ${percentage}%\n`;
        response += `📊 Basé sur ${count}/${nextDealerSuits.length} occurrences\n\n`;
        
        response += `📋 DÉTAILS DE L'ANALYSE:\n`;
        response += `🔍 Résultats analysés: ${historicalLines.length}\n`;
        response += `🎲 Pattern recherché: ${lastDealerSuits.join(' ')}\n`;
        response += `✨ Matchs trouvés: ${sameDealerIndices.length}\n\n`;
        
        if (matchDetails && sameDealerIndices.length <= 5) {
            response += `🔍 MATCHS DÉTECTÉS:\n${matchDetails}\n`;
        }
        
        response += `📈 RÉPARTITION DES COULEURS:\n`;
        for (const [suit, freq] of Object.entries(counter).sort((a, b) => b[1] - a[1])) {
            const pct = Math.round(freq/nextDealerSuits.length*100);
            response += `${suit} : ${freq}x (${pct}%)\n`;
        }
        
        return response;
        
    } catch (error) {
        return `❌ Erreur d'analyse: ${error.message}

🔧 Vérifiez:
• Le format de vos données
• Les symboles de cartes (♠️♥️♦️♣️)
• La présence du mot "SPECIAL:"`;
    }
}

// Commandes du bot
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const name = msg.from.first_name || 'Ami';
    
    const welcome = `🎲 Salut ${name}! 

Je suis votre Bot Analyseur Baccarat!

🎯 OBJECTIF:
Je prédis la couleur de la prochaine carte du croupier en analysant vos patterns historiques.

📝 UTILISATION SIMPLE:
1️⃣ Tapez /analyze
2️⃣ Collez vos résultats (minimum 10)
3️⃣ Ajoutez "SPECIAL:" + le résultat à analyser

📋 EXEMPLE:
/analyze
#N501 (5♣️ K♠️) (4♦️ A♠️)
#N502 (7♥️ 2♠️) (9♠️ J♦️)
#N503 (A♥️ 6♦️) (K♠️ 2♣️)
... (ajoutez plus de lignes)
SPECIAL: #N511 (Q♥️ 3♠️) (4♦️ A♠️)

🧪 COMMANDES:
/test - Démonstration avec données d'exemple
/help - Aide détaillée
/format - Rappel du format

🃏 Je ne regarde que les COULEURS des cartes, pas les valeurs!`;
    
    bot.sendMessage(chatId, welcome);
    console.log(`✅ ${name} (${msg.from.username || 'sans username'}) a démarré le bot`);
});

bot.onText(/\/analyze/, (msg) => {
    const chatId = msg.chat.id;
    const name = msg.from.first_name || 'Utilisateur';
    
    console.log(`🔍 Analyse demandée par ${name}`);
    
    try {
        const result = analyzeForTelegram(msg.text);
        bot.sendMessage(chatId, result);
    } catch (error) {
        const errorMsg = `❌ Erreur lors de l'analyse: ${error.message}

🔧 Vérifiez votre format et réessayez.
Tapez /help pour voir le format correct.`;
        
        bot.sendMessage(chatId, errorMsg);
        console.log('Erreur analyse:', error);
    }
});

bot.onText(/\/test/, (msg) => {
    const chatId = msg.chat.id;
    const name = msg.from.first_name || 'Utilisateur';
    
    console.log(`🧪 Test demandé par ${name}`);
    
    const testMessage = `/analyze
#N501 (5♣️ K♠️ 10♦️) (4♦️ A♠️)
#N502 (7♥️ 2♠️) (9♠️ J♦️ 3♣️)
#N503 (A♥️ 6♦️) (K♠️ 2♣️)
#N504 (9♣️ 5♠️) (7♥️ Q♦️)
#N505 (J♠️ 8♦️) (3♣️ K♥️)
#N506 (2♥️ A♣️) (4♦️ A♠️)
#N507 (Q♦️ 6♠️) (8♥️ 5♣️)
#N508 (K♣️ 4♥️) (J♦️ 7♠️)
#N509 (3♠️ 9♦️) (2♣️ Q♥️)
#N510 (A♦️ 8♣️) (6♠️ K♥️)
#N511 (5♥️ J♠️) (9♦️ 3♣️)
#N512 (7♣️ Q♦️) (A♥️ 8♠️)
SPECIAL: #N513 (K♦️ 2♣️) (4♦️ A♠️)`;
    
    const result = analyzeForTelegram(testMessage);
    bot.sendMessage(chatId, `🧪 DÉMONSTRATION:\n\n${result}`);
});

bot.onText(/\/help/, (msg) => {
    const chatId = msg.chat.id;
    
    const help = `📚 AIDE COMPLÈTE - Analyseur Baccarat

🎯 COMMENT ÇA MARCHE:
Le bot cherche dans votre historique des moments où le croupier a tiré les mêmes COULEURS de cartes que dans votre résultat SPECIAL. Il regarde ensuite ce qui s'est passé au jeu suivant et prédit la couleur la plus fréquente.

📝 FORMAT EXACT:
/analyze
#N### (cartes joueur) (cartes croupier)
#N### (cartes joueur) (cartes croupier)
... (minimum 10 lignes)
SPECIAL: #N### (cartes joueur) (cartes croupier)

🃏 SYMBOLES À UTILISER:
♠️ (Pique) ♥️ (Cœur) ♦️ (Carreau) ♣️ (Trèfle)

✅ EXEMPLE VALIDE:
/analyze
#N501 (5♣️ K♠️) (4♦️ A♠️)
#N502 (7♥️ 2♠️) (9♠️ J♦️)
SPECIAL: #N503 (Q♥️ 3♠️) (4♦️ A♠️)

❌ ERREURS COURANTES:
• Oublier le mot "SPECIAL:"
• Moins de 10 résultats historiques
• Mauvais symboles de cartes
• Format incorrect (#N### manquant)

💡 CONSEIL:
Plus vous avez de données historiques, plus la prédiction sera précise!

🔧 COMMANDES:
/start - Accueil
/test - Démonstration
/format - Rappel du format
/help - Cette aide`;
    
    bot.sendMessage(chatId, help);
});

bot.onText(/\/format/, (msg) => {
    const chatId = msg.chat.id;
    
    const format = `📝 RAPPEL DU FORMAT:

/analyze
#N501 (5♣️ K♠️) (4♦️ A♠️)
#N502 (7♥️ 2♠️) (9♠️ J♦️)
#N503 (A♥️ 6♦️) (K♠️ 2♣️)
#N504 (9♣️ 5♠️) (7♥️ Q♦️)
#N505 (J♠️ 8♦️) (3♣️ K♥️)
#N506 (2♥️ A♣️) (4♦️ A♠️)
#N507 (Q♦️ 6♠️) (8♥️ 5♣️)
#N508 (K♣️ 4♥️) (J♦️ 7♠️)
#N509 (3♠️ 9♦️) (2♣️ Q♥️)
#N510 (A♦️ 8♣️) (6♠️ K♥️)
SPECIAL: #N511 (K♦️ 2♣️) (4♦️ A♠️)

🔍 Points importants:
• Minimum 10 lignes avant SPECIAL:
• Format: #N### (cartes) (cartes)
• Symboles: ♠️♥️♦️♣️
• Mot-clé: SPECIAL: (avec les deux points)

📋 Copiez ce format et remplacez par vos vraies données!`;
    
    bot.sendMessage(chatId, format);
});

// Gestion des messages non reconnus
bot.on('message', (msg) => {
    if (!msg.text || msg.text.startsWith('/')) return;
    
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, `❓ Message non reconnu.

🤖 Commandes disponibles:
/start - Démarrer
/analyze - Analyser vos données
/test - Démonstration
/help - Aide complète
/format - Format des données

💡 Tapez /start pour voir comment utiliser le bot.`);
});

// Gestion des erreurs
bot.on('error', (error) => {
    console.log('❌ Erreur bot:', error);
});

bot.on('polling_error', (error) => {
    console.log('❌ Erreur polling:', error);
});

// Message de confirmation
console.log('✅ Bot Telegram Analyseur Baccarat prêt!');
console.log('🔍 En attente de messages...');
￼Enter
