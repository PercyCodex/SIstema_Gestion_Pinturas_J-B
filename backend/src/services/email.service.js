"use strict";

/**
 * Servicio para envío de correos electrónicos mediante Resend
 * Inicialización lazy — no falla si RESEND_API_KEY no está configurada
 */
class EmailService {
    constructor() {
        // NO inicializar Resend aquí — se hace lazy en cada llamada
        this.from = process.env.RESEND_FROM || "onboarding@resend.dev";
    }

    _getResend() {
        if (!process.env.RESEND_API_KEY) {
            throw new Error("RESEND_API_KEY no configurada en el archivo .env");
        }
        // Importar y crear instancia solo cuando se necesite
        const { Resend } = require("resend");
        return new Resend(process.env.RESEND_API_KEY);
    }

    /**
     * Envía un correo electrónico general
     */
    async enviarCorreo(destino, asunto, html) {
        try {
            const resend = this._getResend();
            const data = await resend.emails.send({
                from:    this.from,
                to:      destino,
                subject: asunto,
                html:    html,
            });
            return data;
        } catch (error) {
            console.error("Error al enviar correo:", error.message);
            throw new Error("No se pudo enviar el correo electrónico: " + error.message);
        }
    }

    /**
     * Envía una boleta/nota de venta por correo
     */
    async enviarBoleta(destino, asunto, htmlContent, pdfBuffer = null, fileName = "comprobante.pdf") {
        try {
            const resend = this._getResend();
            const attachments = pdfBuffer ? [{
                filename: fileName,
                content:  pdfBuffer,
            }] : [];

            const data = await resend.emails.send({
                from:        this.from,
                to:          destino,
                subject:     asunto,
                html:        htmlContent,
                attachments: attachments
            });
            return data;
        } catch (error) {
            console.error("Error al enviar boleta:", error.message);
            throw new Error("No se pudo enviar la boleta por correo: " + error.message);
        }
    }
}

module.exports = new EmailService();