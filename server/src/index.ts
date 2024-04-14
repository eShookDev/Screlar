import axios, { AxiosResponse } from "axios";
import fs from "fs";

import { Aggiudicatario, Committente, Content, Dati, Oggetto } from "./notice";

// Definizione dell'interfaccia SchemaResponse
interface SchemaResponse {
    content: {
        template: {
            template: {
                sections: {
                    name: string;
                    items: Oggetto[],
                    fields: Dati & Committente
                }[]
            }
        }[]
    }[]
}

/**
 * Carica le variabili d'ambiente
 */
require('dotenv').config();

/**
 * Funzione per filtrare i dati del committente
 * @param section 
 * @returns Committente
 */
const filterCommittente = (section: any) => {
    let result: any = {};

    if (section.denominazione_sa === null && section.hasOwnProperty("soggetti_sa")) {
        const soggetti = section.soggetti_sa.map((soggetto: any) => ({
            codice_fiscale_sa: soggetto.codice_fiscale,
            denominazione_sa: soggetto.denominazione_amministrazione
        }));

        // Combina gli oggetti all'interno dell'array soggetti in un unico oggetto
        result = soggetti.reduce((acc: any, curr: any) => ({ ...acc, ...curr }), {});

    } else if (section.denominazione_sa && !section.hasOwnProperty("soggetti_sa")) {
        result = {
            codice_fiscale_sa: section.codice_fiscale_sa,
            denominazione_sa: section.denominazione_sa
        };
    }

    return result;
}

/**
 * Funzione per inviare una richiesta per dati aggiuntivi utilizzando il CIG come parametro
 * @param cig 
 * @returns Oggetto contenente i dati aggiuntivi estratti
 */
const postExtraData = async (cig: string) => {

    try {
        const { data } = await axios.post(
            "https://dati.anticorruzione.it/api/v1/chart/data",
            {
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
                        cig: cig
                    }
                }],
                form_data: {}
            },
            {
                headers: {
                    "Content-Type": "application/json"
                }
            }
        );

        const content = data.result.map((item: { data: any[]; }) => {
            const subItem = item.data[0];
            const jsonBando = JSON.parse(subItem.bando);
            const jsonAppalto = JSON.parse(subItem.stazione_appaltante);
            const jsonAggiudicatario = JSON.parse(subItem.partecipanti) ? JSON.parse(subItem.partecipanti)[0] : [];

            const cpv = jsonBando.CPV.find(() => true)?.COD_CPV;
            const importo_complessivo_gara = jsonBando.IMPORTO_COMPLESSIVO_GARA;
            const oggetto_gara = jsonBando.OGGETTO_GARA;
            const oggetto_lotto = jsonBando.OGGETTO_LOTTO;
            const importo_gara = jsonBando.IMPORTO_LOTTO;
            const codice_fiscale_sa = jsonAppalto.CF_AMMINISTRAZIONE_APPALTANTE;
            const denominazione_sa = jsonAppalto.DENOMINAZIONE_AMMINISTRAZIONE_APPALTANTE;
            const codice_fiscale_ag = jsonAggiudicatario.CODICE_FISCALE
            const denominazione_ag = jsonAggiudicatario.DENOMINAZIONE

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

    } catch (error) {
        console.error("Errore:", error);
    }
}


/**
 * Recupera i dati dall'URL fornito
 * @param url L'URL da cui recuperare i dati
 * @param page Paginazione
 * @param size Numeri di oggetti
 * @returns Un array di oggetti Content
 */
const initializeFetchUrl = async (url: string, page?: number, size?: number): Promise<Content[]> => {

    try {
        const response: AxiosResponse<SchemaResponse> = await axios.get(`${url}&size=${size || '8'}${page ? '&page=' + page : ''}`);

        if (!response.data.content || response.data.content.length === 0) {
            throw new Error('Dati del contenuto non trovati nella risposta API');
        }

        const content: Content[] = [];

        let committente: any;
        let tipo_procedura_aggiudicazione: string | undefined;

        for (const contentItem of response.data.content) {
            for (const template of contentItem.template) {
                for (const section of template.template.sections) {

                    // Filtra e memorizza informazioni sul committente
                    if (section.fields && section.name === "SEZ. A - Committente")
                        committente = filterCommittente(section.fields);

                    // Verifica e memorizza il tipo di procedura di aggiudicazione
                    if (section.fields && section.fields.tipo_procedura_aggiudicazione !== undefined) {
                        tipo_procedura_aggiudicazione = section.fields.tipo_procedura_aggiudicazione;
                    } else {
                        if (section.fields) {
                            tipo_procedura_aggiudicazione = "Tipo di procedura non definito";
                        }
                    }

                    const items = section.items?.map(item => {
                        const cig = item.cig;

                        if (item.comunicazione_annullamento_revoca) {
                            return {
                                cig,
                                comunicazione_annullamento_revoca: item.comunicazione_annullamento_revoca
                            }
                        } else {
                            const aggiudicatari_ad: Aggiudicatario[] = item.aggiudicatari_ad.map(aggiudicatario => ({
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

                        const extraDataPromises = [];

                        // Recupera i dati aggiuntivi per ogni item e inserisce la promessa nell'array extraDataPromises
                        for (const item of items) {
                            extraDataPromises.push(postExtraData(item.cig));
                        }

                        const extraDataResults = (await Promise.all(extraDataPromises))[0];

                        // Se il committente non è definito, lo imposta con i dati aggiuntivi
                        if (Object.keys(committente).length === 0) {
                            committente = {
                                codice_fiscale_sa: extraDataResults.codice_fiscale_sa,
                                denominazione_sa: extraDataResults.denominazione_sa
                            }
                        }

                        // Verifica se ci sono dati eccessivi da integrare
                        for (const item of items) {

                            // Se non ci sono aggiudicatari, interrompe
                            if (!item.aggiudicatari_ad) break;

                            for (const aggiudicatario of item.aggiudicatari_ad) {
                                aggiudicatario.importo = extraDataResults.importo_gara;
                                aggiudicatario.oggetto_lotto = extraDataResults.oggetto_lotto;
                                for (const soggetto of aggiudicatario.soggetti) {
                                    soggetto.codice_fiscale = extraDataResults.codice_fiscale_ag;
                                    soggetto.denominazione = extraDataResults.denominazione_ag;
                                }
                            }
                        }

                        // Rimuove i dati non necessari dagli extra data
                        const excludedKeys = ["codice_fiscale_sa", "denominazione_sa", "codice_fiscale_ag", "denominazione_ag", "importo_gara", "oggetto_lotto"];
                        const filteredExtraDataResults = Object.fromEntries(
                            Object.entries(extraDataResults).filter(([key]) => !excludedKeys.includes(key))
                        );


                        content.push({
                            committente,
                            tipo_procedura_aggiudicazione,
                            ...filteredExtraDataResults,
                            items,
                        });
                    }
                }
            }
        }

        return content;

    } catch (error) {
        console.error("Errore:", error);
        throw error
    }
};


/**
 * Inizializza il processo di recupero e scrive i dati in un file JSON
 */
const initialize = async () => {
    try {
        const data: Content[] = await initializeFetchUrl(process.env.SITE_URL || '');

        // Scrivi i dati nel file JSON
        fs.writeFileSync('data.json', JSON.stringify(data, null, 2));
        console.log('Dati scritti nel file data.json.');

    } catch (error) {
        console.error("Errore:", error);
    }
};

/**
 * Avvia il processo di inizializzazione
 */
initialize();
