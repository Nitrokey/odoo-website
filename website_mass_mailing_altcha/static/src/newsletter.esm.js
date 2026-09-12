/* Copyright 2026 Nitrokey GmbH */
import "@website_mass_mailing/js/website_mass_mailing";
import {AltchaLegacyClassFunctionality} from "@website_altcha/altcha.esm";
import {_t} from "@web/core/l10n/translation";
import publicWidget from "@web/legacy/js/public/public_widget";
import {renderToString} from "@web/core/utils/render";
import {rpc} from "@web/core/network/rpc";

publicWidget.registry.subscribe.include({
    ...AltchaLegacyClassFunctionality,
    altcha_prepend_to: ".js_subscribe_wrap",
});

publicWidget.registry.subscribe.include({
    altcha_insert_widget() {
        if (this.editableMode || !this.altcha_enabled) {
            return;
        }
        if (!this.el.querySelector("altcha-widget")) {
            this.$el
                .find(this.altcha_prepend_to)
                .append(renderToString("website_altcha.AltchaWidget", {}));
        }
    },

    async altcha_get_payload() {
        const widget = this.el.querySelector("altcha-widget");
        if (!widget) {
            return false;
        }
        await this._altchaReady;
        if (widget.getState?.() === "verified") {
            // The visitor ticked the checkbox, and its payload is still unused
            return widget.querySelector('input[name="altcha"]')?.value || false;
        }
        if (typeof widget.verify !== "function") {
            return false;
        }
        return (await widget.verify())?.payload || false;
    },

    async altcha_subscribe(params) {
        try {
            return await rpc("/website_mass_mailing/subscribe", params);
        } catch (error) {
            this.altcha_notify(error.data?.message || error.message, "danger");
            return false;
        }
    },

    altcha_notify(message, type) {
        this.notification.add(message, {
            type: type,
            title: type === "success" ? _t("Success") : _t("Error"),
            sticky: true,
        });
    },

    async _onSubscribeClick() {
        if (!this.altcha_enabled) {
            return this._super(...arguments);
        }
        const inputName = this.$(
            "input.js_subscribe_value, input.js_subscribe_email"
        ).attr("name");
        // The class js_subscribe_email is kept by compatibility, it was the
        // old name of js_subscribe_value.
        const $input = this.$(
            ".js_subscribe_value:visible, .js_subscribe_email:visible"
        );
        if (inputName === "email" && $input.length && !$input.val().match(/.+@.+/)) {
            this.$el
                .addClass("o_has_error")
                .find(".form-control")
                .addClass("is-invalid");
            return false;
        }
        this.$el
            .removeClass("o_has_error")
            .find(".form-control")
            .removeClass("is-invalid");

        const payload = await this.altcha_get_payload();
        if (!payload) {
            this.altcha_notify(
                _t("Please complete the captcha before subscribing."),
                "danger"
            );
            return false;
        }

        const tokenObj = await this._recaptcha.getToken(
            "website_mass_mailing_subscribe"
        );
        if (tokenObj.error) {
            this.altcha_notify(tokenObj.error, "danger");
            return false;
        }

        const result = await this.altcha_subscribe({
            list_id: this._getListId(),
            value: $input.length ? $input.val() : false,
            subscription_type: inputName,
            recaptcha_token_response: tokenObj.token,
            turnstile_captcha: this.el.parentElement?.querySelector(
                'input[name="turnstile_captcha"]'
            )?.value,
            altcha: payload,
        });
        if (!result) {
            return false;
        }
        if (result.toast_type === "success") {
            this._updateSubscribeControlsStatus(true);
            const $popup = this.$el.closest(".o_newsletter_modal");
            if ($popup.length) {
                $popup.modal("hide");
            }
        }
        this.altcha_notify(result.toast_content, result.toast_type);
        return true;
    },
});
