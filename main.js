// main.js

const Discord = require('discord.js');
const { google } = require('googleapis'); // Importa googleapis desde la biblioteca Google APIs
const credentials = require('./credentials.json'); // Importa las credenciales necesarias para la autenticación con Google Sheets
const keep_alive = require('./keep_alive.js');
const idCanalTexto = '1238411272614318091';
const idGoogleSheet = '1oF3C-HaQdRqfWEk5yg63F-BfYYQMME1eanIdN_pz1J0';
const fs = require('fs');

const TIME_FILE = 'timeRemaining.json';

let reinicios = 0;

// Lista de actionTypes de interés
const actionTypesOfInterest = {
    24: 'Información de Usuario Actualizada',
    26: 'Usuario Movido de Canal',
    27: 'Usuario Desconectado de Canal de Voz',
    72: 'Mensaje Eliminado'
};

// Mensajes de error
const noGestapoRoleMessage = "¡Ups! Parece que me falta información. No encontré el rol '👮‍♂️ Gestapo 👮‍♂️'.";
const noMembersWithGestapoRoleMessage = "¡Oops! No hay nadie con el rol '👮‍♂️ Gestapo 👮‍♂️'.";

// Función para formatear la fecha y hora
function formatDateTime(dateTime) {
    const date = dateTime.toLocaleDateString('es-ES');
    const time = dateTime.toLocaleTimeString('es-ES');
    return `${date} ${time}`;
}

// Autenticación con Google Sheets
const auth = new google.auth.GoogleAuth({
    keyFile: 'credentials.json', // Utiliza el archivo credentials.json para la autenticación
    scopes: ['https://www.googleapis.com/auth/spreadsheets'], // Define los permisos necesarios para acceder a Google Sheets
});

// Crear cliente de Google Sheets
const sheets = google.sheets({ version: 'v4', auth }); // Crea un cliente de Google Sheets usando la versión 4 de la API y la autenticación definida anteriormente

// Crear cliente de Discord
const client = new Discord.Client({
    intents: 3276799 // Define los intentos necesarios para el cliente de Discord
});

// Función para mostrar el mensaje de presentación
async function presentarse() {
    const rankingMessage = await generarRanking();
    const channel = client.channels.cache.get(idCanalTexto); // Reemplaza "ID_DEL_CANAL" con el ID del canal donde quieres que aparezca el mensaje de presentación
    if (channel) {
        await channel.send(rankingMessage);
    }
}

// Objeto para almacenar las acciones de interés por usuario
let userActions = {};

// Evento "ready" para el cliente
client.on('ready', async () => {
    console.log('¡Estoy listo!'); // Imprime un mensaje en la consola cuando el bot está listo
    limpiarChat();
    mostrarBarraProgreso()
});

async function actualizarRanking() {
    //limpiarChat();
    try {
        const guild = client.guilds.cache.first(); // Obtiene el primer servidor en el que está el bot
        if (!guild) return; // Si no se encuentra ningún servidor, salir de la función
        const auditLogs = await guild.fetchAuditLogs({ limit: 100 }); // Obtiene los registros de auditoría del servidor (hasta 100 registros)
        // Filtrar los registros de auditoría de interés
        const relevantLogs = auditLogs.entries.filter(log => Object.keys(actionTypesOfInterest).includes(log.action.toString()));

        const dataToSend = []; // Crea una lista para almacenar los datos a enviar a Google Sheets

        // Por cada registro de auditoría relevante, añadir los datos a la lista
        relevantLogs.forEach(log => {
            const userId = log.executor.id; // Obtiene el ID del usuario que realizó la acción
            const username = client.users.cache.get(userId).tag; // Obtiene el nombre de usuario del ID
            const date = new Date(log.createdAt).toLocaleDateString('es-ES'); // Obtiene la fecha del registro
            const time = new Date(log.createdAt).toLocaleTimeString('es-ES'); // Obtiene la hora del registro
            const action = actionTypesOfInterest[log.action]; // Obtiene la acción realizada
            const rowData = [username, date, time, action, log.action]; // Crea una fila de datos con el nombre de usuario, fecha, hora, acción y ID de la acción
            dataToSend.push(rowData); // Añade la fila de datos a la lista de datos a enviar
        });

        // Llama a la función writeToSheet para enviar los datos a Google Sheets
        writeToSheet(dataToSend);
        console.log('Reiniciando Ranking...'); // Imprime un mensaje en la consola cuando el bot está listo
    } catch (error) {
        console.error('Error al generar el ranking automáticamente:', error);
    }
}

// Función para limpiar todo el chat
async function limpiarChat() {
    const channel = client.channels.cache.get(idCanalTexto); // Reemplaza "ID_DEL_CANAL" con el ID del canal que deseas limpiar
    if (channel) {
        try {
            await channel.bulkDelete(100); // Elimina hasta 100 mensajes del canal
            console.log('Chat limpiado exitosamente.');
        } catch (error) {
            console.error('Error al limpiar el chat:', error);
        }
    } else {
        console.error('No se pudo encontrar el canal.');
    }
}

// Función para mostrar el tiempo restante hasta la próxima actualización del ranking
async function mostrarTiempoRestante() {
    const channel = client.channels.cache.get(idCanalTexto); // Reemplaza "ID_DEL_CANAL" con el ID del canal donde deseas mostrar el tiempo restante
    if (channel) {
        let tiempoRestante = leerTiempoRestante(); // Leer el tiempo restante del archivo
        const mensajeTiempo = await channel.send(`:trophy: **Top 3 del ranking** :trophy: Tiempo restante para la próxima actualización: ${convertirTiempo(tiempoRestante)}`);

        const intervalo = setInterval(() => {
            tiempoRestante--;
            escribirTiempoRestante(tiempoRestante); // Guardar el tiempo restante en el archivo

            if (tiempoRestante > 0) {
                mensajeTiempo.edit(`:trophy: **Top 3 del ranking** :trophy: Tiempo restante para la próxima actualización: ${convertirTiempo(tiempoRestante)}`);
            } else {
                clearInterval(intervalo);
                escribirTiempoRestante(129600); // Reiniciar el tiempo restante a 1.5 días (en segundos)
                mostrarBarraProgreso(); // Llamar a la función para mostrar la barra de progreso
            }
        }, 1000); // Intervalo de actualización: cada segundo
    } else {
        console.error('No se pudo encontrar el canal.');
    }
}

// Función para convertir el tiempo restante en días, horas, minutos y segundos
function convertirTiempo(segundos) {
    const dias = Math.floor(segundos / (24 * 60 * 60));
    segundos %= 24 * 60 * 60;
    const horas = Math.floor(segundos / (60 * 60));
    segundos %= 60 * 60;
    const minutos = Math.floor(segundos / 60);
    segundos %= 60;

    return `${dias}d ${horas}h ${minutos}m ${segundos}s`;
}

// Genera un Ranking
async function generarRanking() {
    const spreadsheetId = idGoogleSheet;
    const response = await sheets.spreadsheets.get({
        spreadsheetId,
    });

    const sheetsInfo = response.data.sheets;
    const rankings = {};

    // Constantes para las IDs de interés
    const INFO_USUARIO_ACTUALIZADA = 24;
    const USUARIO_MOVIDO_DE_CANAL = 26;
    const USUARIO_DESCONECTADO_DE_CANAL_DE_VOZ = 27;
    const MENSAJE_ELIMINADO = 72;

    for (const sheetInfo of sheetsInfo) {
        const sheetTitle = sheetInfo.properties.title;

        // Si el título de la hoja es "Hoja 1", continuar con la siguiente hoja
        if (sheetTitle === "Hoja 1") continue;

        const range = `${sheetTitle}!A2:E`; // Ajustamos el rango para incluir la columna de ID
        const responseRead = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range,
        });
        const sheetData = responseRead.data.values || [];

        // Variables para almacenar las sumas de las IDs de interés
        let infoUsuarioActualizadaCount = 0;
        let usuarioMovidoDeCanalCount = 0;
        let usuarioDesconectadoDeCanalDeVozCount = 0;
        let mensajeEliminadoCount = 0;

        for (const row of sheetData) {
            // Ajustamos la posición de la categoría en el arreglo row
            const id = Number(row[3]);

            // Sumar según la ID de la acción
            switch (id) {
                case INFO_USUARIO_ACTUALIZADA:
                    infoUsuarioActualizadaCount++;
                    break;
                case USUARIO_MOVIDO_DE_CANAL:
                    usuarioMovidoDeCanalCount++;
                    break;
                case USUARIO_DESCONECTADO_DE_CANAL_DE_VOZ:
                    usuarioDesconectadoDeCanalDeVozCount++;
                    break;
                case MENSAJE_ELIMINADO:
                    mensajeEliminadoCount++;
                    break;
                default:
                    break;
            }
        }

        // Guardar los datos en el ranking
        rankings[sheetTitle] = {
            totalAbusos: infoUsuarioActualizadaCount + usuarioMovidoDeCanalCount + usuarioDesconectadoDeCanalDeVozCount + mensajeEliminadoCount + 1,
            idSums: {
                [INFO_USUARIO_ACTUALIZADA]: infoUsuarioActualizadaCount > 0 ? infoUsuarioActualizadaCount : undefined,
                [USUARIO_MOVIDO_DE_CANAL]: usuarioMovidoDeCanalCount > 0 ? usuarioMovidoDeCanalCount : undefined,
                [USUARIO_DESCONECTADO_DE_CANAL_DE_VOZ]: usuarioDesconectadoDeCanalDeVozCount > 0 ? usuarioDesconectadoDeCanalDeVozCount : undefined,
                [MENSAJE_ELIMINADO]: mensajeEliminadoCount > 0 ? mensajeEliminadoCount : undefined,
            },
        };
    }

    // Ordenar el ranking
    const sortedRanking = Object.entries(rankings)
        .sort(([, userDataA], [, userDataB]) => userDataB.totalAbusos - userDataA.totalAbusos)
        .slice(0, 10); // Mostrar solo los primeros 10 puestos

    let message = ":trophy: **Top del ranking** :trophy: \n\n";
    sortedRanking.forEach(([username, userData], index) => {
        const { totalAbusos, idSums } = userData;

        // Crear la tabla para el usuario
        message += `\`\`\`
|  ${index + 1}. ${username}: Total Abusos: ${totalAbusos}  |
|-----------------------------------------------------------|
`;

        // Mostrar las categorías con sus respectivas cantidades
        if (idSums[INFO_USUARIO_ACTUALIZADA] !== undefined) {
            message += `| Información de Usuario Actualizada: ${idSums[INFO_USUARIO_ACTUALIZADA]} |\n`;
        }
        if (idSums[USUARIO_MOVIDO_DE_CANAL] !== undefined) {
            message += `| Usuario Movido de Canal: ${idSums[USUARIO_MOVIDO_DE_CANAL]} |\n`;
        }
        if (idSums[USUARIO_DESCONECTADO_DE_CANAL_DE_VOZ] !== undefined) {
            message += `| Usuario Desconectado de Canal de Voz: ${idSums[USUARIO_DESCONECTADO_DE_CANAL_DE_VOZ]} |\n`;
        }
        if (idSums[MENSAJE_ELIMINADO] !== undefined) {
            message += `| Mensajes Eliminados: ${idSums[MENSAJE_ELIMINADO]} |\n`;
        }

        message += "\`\`\`\n\n";
    });

    // Mensaje con el resto del ranking
    Object.entries(rankings)
        .sort(([, userDataA], [, userDataB]) => userDataB.totalAbusos - userDataA.totalAbusos)
        .slice(10)
        .forEach(([username, userData], index) => {
            const { totalAbusos } = userData;
            message += `**${index + 11}. ${username}:** | -> Total Abusos: ${totalAbusos}\n`;
        });

    return message;
}




// Inicia sesión en Discord
client.login(process.env.TOKEN); // login bot using token

// Función para crear la hoja de cálculo del usuario si no existe
async function crearHoja(username) {
    const spreadsheetId = idGoogleSheet;
    const range = `${username}!A1`; // Rango de celdas para escribir

    // Verificar si la hoja de cálculo del usuario existe
    const response = await sheets.spreadsheets.get({
        spreadsheetId,
    });
    const userSheetExists = response.data.sheets.some(sheet => sheet.properties.title === username);

    // Si la hoja de cálculo del usuario no existe, la creamos
    if (!userSheetExists) {
        try {
            await sheets.spreadsheets.batchUpdate({
                spreadsheetId,
                resource: {
                    requests: [
                        {
                            addSheet: {
                                properties: {
                                    title: username,
                                },
                            },
                        },
                    ],
                },
            });
            console.log(`Hoja de cálculo creada para ${username}.`);
        } catch (err) {
            console.error('Error al crear la hoja de cálculo:', err);
        }
    }
}

async function writeToSheet(data) {
    const spreadsheetId = idGoogleSheet;

    // Recorremos los datos y los organizamos por usuario
    const userData = {};
    data.forEach(row => {
        const [username, date, time, action, actionId] = row;
        if (!userData[username]) {
            userData[username] = [];
        }
        userData[username].push([date, time, action, actionId]);
    });

    try {
        for (const username in userData) {
            await crearHoja(username); // Crear la hoja de cálculo para el usuario si no existe

            const range = `${username}!A1:D`; // Rango de celdas para leer
            const responseRead = await sheets.spreadsheets.values.get({
                spreadsheetId,
                range,
            });
            const existingData = responseRead.data.values || [];

            const newData = userData[username].filter(newRow => {
                // Comprobamos si ya existe una fila con la misma fecha y hora
                return !existingData.some(existingRow => {
                    return existingRow[0] === newRow[0] && existingRow[1] === newRow[1];
                });
            });

            if (newData.length > 0) {
                // Escribir datos en la hoja de cálculo
                const request = {
                    spreadsheetId,
                    range: `${username}!A${existingData.length + 1}`, // Empezar a escribir después de los datos existentes
                    valueInputOption: 'RAW',
                    resource: { values: newData },
                };

                const responseWrite = await sheets.spreadsheets.values.append(request);

                console.log(`Datos escritos en la hoja de cálculo de ${username}.`);
            } else {
                console.log(`No hay nuevos datos para escribir en la hoja de cálculo de ${username}.`);
            }
        }
    } catch (err) {
        console.error('Error writing data to Google Sheets:', err);
    }
}

// Función para mostrar una barra de progreso ASCII mientras se actualiza el ranking y se limpia el chat
async function mostrarBarraProgreso() {
    try {
        const channel = client.channels.cache.get(idCanalTexto);
        if (!channel) return;

        const progressMessage = await channel.send(':hourglass: Actualizando ranking y limpiando chat...');

        const barSize = 20;
        const fillDuration = 2000;
        const increment = fillDuration / barSize / 4;
        let progressBar = '';

        await progressMessage.edit(`:hourglass_flowing_sand: Actualizando datos...\n\`${progressBar}\``);

        for (let i = 0; i < barSize; i++) {
            progressBar += '▰';
            await progressMessage.edit(`:hourglass_flowing_sand: Actualizando datos...\n\`${progressBar.padEnd(barSize, '▱')}\``);
            await wait(increment);
        }
        await progressMessage.edit(`:hourglass_flowing_sand: Datos Actualizados`);

        await actualizarRanking(); // Actualizar el ranking después de la barra de progreso
        //await mostrarTiempoRestante(); // Reiniciar el ciclo

        await wait(10000);

        await presentarse(); // Generar el ranking después de la actualización

        // Intentar eliminar el mensaje de progreso
        try {
            await progressMessage.delete();
        } catch (deleteError) {
            console.error('Error al eliminar el mensaje de progreso:', deleteError.message);
        }


        

    } catch (error) {
        console.error('Error al mostrar la barra de progreso:', error);
    }
    //await mostrarTiempoRestante();
}

// Función para esperar un cierto tiempo (simula una operación asíncrona)
function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Inicializar el archivo con el tiempo restante inicial si no existe
if (!fs.existsSync(TIME_FILE)) {
    fs.writeFileSync(TIME_FILE, JSON.stringify({ tiempoRestante: 129600 })); // Inicializa con 1.5 días (en segundos)
}

// Función para leer el tiempo restante del archivo
function leerTiempoRestante() {
    const data = fs.readFileSync(TIME_FILE);
    const json = JSON.parse(data);
    return json.tiempoRestante;
}

// Función para escribir el tiempo restante en el archivo
function escribirTiempoRestante(tiempoRestante) {
    const json = { tiempoRestante };
    fs.writeFileSync(TIME_FILE, JSON.stringify(json));
}
