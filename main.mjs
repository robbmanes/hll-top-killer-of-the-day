import { Client, GatewayIntentBits, EmbedBuilder } from 'discord.js';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import cron from 'node-cron';

dotenv.config();

const API_BASE_URL = process.env.RCON_API_BASE_URL;
const API_TOKEN = process.env.RCON_API_TOKEN;
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const DISCORD_CHANNEL_ID = process.env.DISCORD_CHANNEL_ID;
const RESTART_TIME = process.env.RESTART_TIME || '04:00'; // Default to 4 AM if not specified

let playerKills = {};
let messageId = null;

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] });

const roleTranslations = {
    "officer": "Officer",
    "spotter": "Spotter",
    "tankcommander": "Tank Commander",
    "armycommander": "Commander",
    "antitank": "Anti-Tank",
    "rifleman": "Rifleman",
    "medic": "Medic",
    "automaticrifleman": "Automatic Rifleman",
    "assault": "Assault",
    "support": "Support",
    "heavymachinegunner": "Machine Gunner",
    "sniper": "Sniper",
    "engineer": "Engineer",
    "crewman": "Crewman",
    "recon": "Sniper"
};

const rankEmojis = ['🥇', '🥈', '🥉'];

async function getPlayerData() {
    const url = `${API_BASE_URL}/api/get_detailed_players`;
    try {
        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${API_TOKEN}`
            }
        });
        if (response.status !== 200) {
            throw new Error(`Failed to fetch data: ${response.statusText}`);
        }
        const data = await response.json();
        console.log('API response:', data);

        if (data.result && data.result.players && typeof data.result.players === 'object') {
            return Object.values(data.result.players)
                .filter(player => {
                    if (!player || typeof player !== 'object') {
                        console.warn('Skipping invalid player object:', player);
                        return false;
                    }
                    if (!player.kills || !player.name || !player.role) {
                        console.warn('Skipping player with missing data:', player);
                        return false;
                    }
                    return player.kills > 0;
                })
                .map(player => ({
                    name: player.name,
                    steam_id_64: player.steam_id_64,
                    kills: player.kills,
                    role: roleTranslations[player.role] || player.role
                }));
        } else {
            console.warn('Unexpected response format or no valid player data');
            return [];
        }
    } catch (error) {
        console.error('Error fetching player data:', error);
        return [];
    }
}

function updateKillData(players) {
    players.forEach(player => {
        const { name, kills, role } = player;
        if (playerKills[name]) {
            if (kills > playerKills[name].kills) {
                playerKills[name] = { kills, role };
            }
        } else {
            playerKills[name] = { kills, role };
        }
    });
}

function getTop20Players() {
    return Object.entries(playerKills)
        .sort(([, { kills: killsA }], [, { kills: killsB }]) => killsB - killsA)
        .slice(0, 20)
        .map(([name, { kills, role }], index) => ({ index: index + 1, name, kills, role }));
}

function truncatePlayerNameRole(name, role, maxLength) {
    const combined = `${name} (${role})`;
    if (combined.length > maxLength) {
        return combined.slice(0, maxLength - 3) + '...';
    }
    return combined;
}

async function sendToDiscord(topPlayers) {
    const embed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle('Top 20 Players with the highest kill count')
        .setThumbnail('https://imgur.com/cYkTFeF.png')
        .setFooter({ text: 'Last Refresh', iconURL: 'https://i.imgur.com/9Iaiwje.png' })
        .setTimestamp();

    if (topPlayers.length > 0) {
        const description = topPlayers.map(player => {
            let rankIndicator = player.index <= 3 ? rankEmojis[player.index - 1] : `${player.index}.`;
            let playerEntry = `${rankIndicator} ${player.kills} - ${truncatePlayerNameRole(player.name, player.role, 44)}`;
            if (player.index <= 3) {
                playerEntry = `**${playerEntry}**`;
            }
            return playerEntry;
        }).join('\n');

        embed.setDescription(description || 'No Player data available.');
    } else {
        embed.setDescription('No Player data available. Please try it again later.');
    }

    const channel = client.channels.cache.get(DISCORD_CHANNEL_ID);

    if (!channel) {
        console.error('Failed to find the Discord channel.');
        return;
    }

    try {
        if (messageId) {
            const message = await channel.messages.fetch(messageId);
            if (message) {
                await message.edit({ embeds: [embed] });
            } else {
                throw new Error('Failed to find the message to edit.');
            }
        } else {
            const message = await channel.send({ embeds: [embed] });
            messageId = message.id;
        }
    } catch (error) {
        console.error('Error sending/editing Discord message:', error);
        
        const message = await channel.send({ embeds: [embed] });
        messageId = message.id;
    }
}

async function main() {
    try {
        const players = await getPlayerData();
        updateKillData(players);
        const topPlayers = getTop20Players();
        await sendToDiscord(topPlayers);
    } catch (error) {
        console.error('Error in main function:', error);
        
        const errorEmbed = new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle('Error on retrieving player data')
            .setDescription('There was a problem handling the player data')
            .setFooter({ text: 'Last Refresh', iconURL: 'https://i.imgur.com/9Iaiwje.png' })
            .setTimestamp();

        const channel = client.channels.cache.get(DISCORD_CHANNEL_ID);
        if (channel) {
            await channel.send({ embeds: [errorEmbed] });
        }
    }
}

function scheduleRestart() {
    const [hour, minute] = RESTART_TIME.split(':').map(Number);
    
    cron.schedule(`${minute} ${hour} * * *`, () => {
        console.log('Scheduled restart initiated.');
        process.exit(0); // Exit the process, assuming it will be automatically restarted by a process manager
    });
    
    console.log(`Restart scheduled for ${RESTART_TIME} every day.`);
}

client.once('ready', () => {
    console.log('Discord bot is ready and connected.');
    setInterval(main, 15 * 1000);
    main();
    scheduleRestart();
});

client.login(DISCORD_TOKEN);
