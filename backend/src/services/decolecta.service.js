"use strict";

const axios = require("axios");

/**
 * Servicio para consultar datos de ciudadanos mediante API de Decolecta / Docator
 */
class DecolectaService {
    constructor() {
        this.apiKey = process.env.DECOLECTA_API_KEY;
        // El usuario mencionó "Docator", que suele usar esta estructura o similar
        this.baseUrl = "https://api.docator.com/v1/dni"; 
    }

    /**
     * Valida el formato de un DNI (8 dígitos)
     */
    validarFormatoDNI(dni) {
        return /^\d{8}$/.test(dni);
    }

    /**
     * Consulta un DNI en la API
     */
    async consultarDNI(dni) {
        if (!this.validarFormatoDNI(dni)) {
            throw new Error("Formato de DNI inválido. Deben ser 8 dígitos.");
        }

        // Si no hay API Key de Decolecta, intentamos buscar en la de Docator si estuviera configurada
        const key = this.apiKey || process.env.DOCATOR_API_KEY;

        if (!key) {
            throw new Error("API Key no configurada (DECOLECTA_API_KEY).");
        }

        try {
            // Probamos con la URL de Docator/Decolecta
            const url = `${this.baseUrl}/${dni}`;
            const response = await axios.get(url, {
                headers: {
                    'Authorization': `Bearer ${key}`,
                    'Accept': 'application/json'
                }
            });

            const data = response.data;
            
            // Adaptar respuesta al formato unificado
            return {
                dni: data.numeroDocumento || data.dni || dni,
                nombres: data.nombres || data.nombre,
                apellidoPaterno: data.apellidoPaterno || "",
                apellidoMaterno: data.apellidoMaterno || "",
                nombreCompleto: data.nombreCompleto || `${data.nombres} ${data.apellidoPaterno} ${data.apellidoMaterno}`.trim()
            };
        } catch (error) {
            console.error("Error en DNI Service:", error.response?.data || error.message);
            
            // Si falla Docator, intentamos con Decolecta como fallback si la URL fuera distinta
            if (this.baseUrl.includes("docator")) {
                try {
                    const fallbackUrl = `https://api.decolecta.com/v1/dni/${dni}`;
                    const res = await axios.get(fallbackUrl, {
                        headers: { 'Authorization': `Bearer ${key}` }
                    });
                    const d = res.data;
                    return {
                        dni: d.numeroDocumento || dni,
                        nombres: d.nombres,
                        apellidoPaterno: d.apellidoPaterno,
                        apellidoMaterno: d.apellidoMaterno,
                        nombreCompleto: d.nombreCompleto || `${d.nombres} ${d.apellidoPaterno} ${d.apellidoMaterno}`.trim()
                    };
                } catch (e) {
                    // Si ambos fallan, lanzamos el error original
                }
            }

            if (error.response?.status === 404) {
                throw new Error("DNI no encontrado en la base de datos de RENIEC.");
            }
            throw new Error("Error al consultar el DNI. Verifique su API Key.");
        }
    }
}

module.exports = new DecolectaService();
