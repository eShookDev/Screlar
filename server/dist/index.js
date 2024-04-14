"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const axios_1 = __importDefault(require("axios"));
const fs_1 = __importDefault(require("fs"));
/**
 * Carica le variabili d'ambiente
 */
require('dotenv').config();
const filterCommittente = (section) => {
    let result = {};
    if (section.denominazione_sa === null && section.hasOwnProperty("soggetti_sa")) {
        const soggetti = section.soggetti_sa.map((soggetto) => ({
            codice_fiscale_sa: soggetto.codice_fiscale,
            denominazione_sa: soggetto.denominazione_amministrazione
        }));
        // Combina gli oggetti all'interno dell'array soggetti in un unico oggetto
        result = soggetti.reduce((acc, curr) => (Object.assign(Object.assign({}, acc), curr)), {});
    }
    else if (section.denominazione_sa && !section.hasOwnProperty("soggetti_sa")) {
        result = {
            codice_fiscale_sa: section.codice_fiscale_sa,
            denominazione_sa: section.denominazione_sa
        };
    }
    return result;
};
const postExtraData = (cig) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { data } = yield axios_1.default.post("https://dati.anticorruzione.it/api/v1/chart/data", {
            datasource: {
                id: 43,
                type: "table"
            },
            queries: [{
                    time_range: "No Filter",
                    columns: [
                        "stazione_appaltante",
                        "bando",
                        "incaricati",
                        "partecipanti"
                    ],
                    url_params: {
                        cig: cig // Provide the value of cig here
                    }
                }],
            form_data: {}
        }, {
            headers: {
                "Content-Type": "application/json"
            }
        });
        const content = data.result.map((item) => {
            var _a;
            const subItem = item.data[0];
            const jsonBando = JSON.parse(subItem.bando);
            const jsonAppalto = JSON.parse(subItem.stazione_appaltante);
            const jsonAggiudicatario = JSON.parse(subItem.partecipanti) ? JSON.parse(subItem.partecipanti)[0] : [];
            const cpv = (_a = jsonBando.CPV.find(() => true)) === null || _a === void 0 ? void 0 : _a.COD_CPV;
            const importo_complessivo_gara = jsonBando.IMPORTO_COMPLESSIVO_GARA;
            const oggetto_gara = jsonBando.OGGETTO_GARA;
            const oggetto_lotto = jsonBando.OGGETTO_LOTTO;
            const importo_gara = jsonBando.IMPORTO_LOTTO;
            const codice_fiscale_sa = jsonAppalto.CF_AMMINISTRAZIONE_APPALTANTE;
            const denominazione_sa = jsonAppalto.DENOMINAZIONE_AMMINISTRAZIONE_APPALTANTE;
            const codice_fiscale_ag = jsonAggiudicatario.CODICE_FISCALE;
            const denominazione_ag = jsonAggiudicatario.DENOMINAZIONE;
            return {
                cpv,
                importo_complessivo_gara,
                oggetto_gara,
                oggetto_lotto,
                codice_fiscale_sa,
                denominazione_sa,
                importo_gara,
                codice_fiscale_ag,
                denominazione_ag
            };
        });
        return content[0];
    }
    catch (error) {
        console.error("Error:", error);
        // Handle error
    }
});
/**
 * Recupera i dati dall'URL fornito
 * @param url L'URL da cui recuperare i dati
 * @param page Paginazione
 * @param size Numeri di oggetti
 * @returns Un array di oggetti Content
 */
const initializeFetchUrl = (url, page, size) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const response = yield axios_1.default.get(`${url}&size=${size || '8'}${page ? '&page=' + page : ''}`);
        if (!response.data.content || response.data.content.length === 0) {
            throw new Error('Dati del contenuto non trovati nella risposta API');
        }
        const content = [];
        let committente;
        let tipo_procedura_aggiudicazione;
        for (const contentItem of response.data.content) {
            for (const template of contentItem.template) {
                for (const section of template.template.sections) {
                    if (section.fields && section.name === "SEZ. A - Committente")
                        committente = filterCommittente(section.fields);
                    if (section.fields && section.fields.tipo_procedura_aggiudicazione !== undefined) {
                        tipo_procedura_aggiudicazione = section.fields.tipo_procedura_aggiudicazione;
                    }
                    else {
                        if (section.fields) {
                            tipo_procedura_aggiudicazione = "Tipo di procedura non definito";
                        }
                    }
                    const items = (_a = section.items) === null || _a === void 0 ? void 0 : _a.map(item => {
                        const cig = item.cig;
                        if (item.comunicazione_annullamento_revoca) {
                            return {
                                cig,
                                comunicazione_annullamento_revoca: item.comunicazione_annullamento_revoca
                            };
                        }
                        else {
                            const aggiudicatari_ad = item.aggiudicatari_ad.map(aggiudicatario => ({
                                importo: aggiudicatario.importo,
                                soggetti: aggiudicatario.soggetti.map(soggetto => ({
                                    codice_fiscale: soggetto.codice_fiscale,
                                    denominazione: soggetto.denominazione
                                }))
                            }));
                            return {
                                cig,
                                aggiudicatari_ad,
                            };
                        }
                    });
                    if (items && items.length > 0) {
                        // Array to store promises from postExtraData
                        const extraDataPromises = [];
                        // Fetch extra data for each item and push the promise into extraDataPromises array
                        for (const item of items) {
                            extraDataPromises.push(postExtraData(item.cig));
                        }
                        const extraDataResults = (yield Promise.all(extraDataPromises))[0];
                        if (Object.keys(committente).length === 0) {
                            committente = {
                                codice_fiscale_sa: extraDataResults.codice_fiscale_sa,
                                denominazione_sa: extraDataResults.denominazione_sa
                            };
                        }
                        // Check items here 
                        for (const item of items) {
                            if (!item.aggiudicatari_ad)
                                break;
                            for (const aggiudicatario of item.aggiudicatari_ad) {
                                console.log(extraDataResults);
                                aggiudicatario.importo = extraDataResults.importo_gara;
                                aggiudicatario.oggetto_lotto = extraDataResults.oggetto_lotto;
                                for (const soggetto of aggiudicatario.soggetti) {
                                    soggetto.codice_fiscale = extraDataResults.codice_fiscale_ag;
                                    soggetto.denominazione = extraDataResults.denominazione_ag;
                                }
                            }
                        }
                        // 
                        const excludedKeys = ["codice_fiscale_sa", "denominazione_sa", "codice_fiscale_ag", "denominazione_ag", "importo_gara", "oggetto_lotto"];
                        // 
                        const filteredExtraDataResults = Object.fromEntries(Object.entries(extraDataResults).filter(([key]) => !excludedKeys.includes(key)));
                        content.push(Object.assign(Object.assign({ committente,
                            tipo_procedura_aggiudicazione }, filteredExtraDataResults), { items }));
                    }
                }
            }
        }
        return content;
    }
    catch (error) {
        throw error;
    }
});
/**
 * Inizializza il processo di recupero e scrive i dati in un file JSON
 */
const initialize = () => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const data = yield initializeFetchUrl(process.env.SITE_URL || '');
        // Scrivi i dati nel file JSON
        fs_1.default.writeFileSync('data.json', JSON.stringify(data, null, 2));
        console.log('Dati scritti nel file data.json.');
    }
    catch (error) {
        console.error('Si è verificato un errore:', error);
    }
});
/**
 * Avvia il processo di inizializzazione
 */
initialize();
