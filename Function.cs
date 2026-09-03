#nullable enable

using System;
using System.Collections.Generic;
using System.Linq;
using System.Net;
using System.Net.Mail;
using System.Text;
using System.Text.Json;

namespace Function;

public class Request
{
    public string httpMethod { get; set; } = string.Empty;
    public string body { get; set; } = string.Empty;
    public bool isBase64Encoded { get; set; }
    public Dictionary<string, string> headers { get; set; } = new();
}

public class Response
{
    public Response(int statusCode, string body)
    {
        StatusCode = statusCode;
        Body = body;
    }

    public int StatusCode { get; set; }
    public string Body { get; set; }
    public Dictionary<string, string> Headers { get; set; } = new();
    public bool IsBase64Encoded { get; set; }
}

public class Handler
{
    private const string AllowedOrigin = "https://sherlockd.github.io";
    private const string RecipientEmail = "StroyKarkasYO@yandex.ru";
    private const string SmtpHost = "smtp.yandex.ru";
    private const int SmtpPort = 587;
    private const string SmtpLogin = "StroyKarkasYO";
    private const int MaximumBodySize = 32 * 1024;

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
    };

    public Response FunctionHandler(Request request)
    {
        request ??= new Request();

        var origin = GetHeader(request.headers, "Origin");

        if (!string.IsNullOrWhiteSpace(origin) &&
            !string.Equals(origin, AllowedOrigin, StringComparison.OrdinalIgnoreCase))
        {
            return JsonResponse(403, false, "Источник запроса не разрешён.");
        }

        if (string.Equals(request.httpMethod, "OPTIONS", StringComparison.OrdinalIgnoreCase))
        {
            return CreateResponse(204, string.Empty);
        }

        if (!string.Equals(request.httpMethod, "POST", StringComparison.OrdinalIgnoreCase))
        {
            return JsonResponse(405, false, "Поддерживается только метод POST.");
        }

        try
        {
            var json = DecodeBody(request);

            if (Encoding.UTF8.GetByteCount(json) > MaximumBodySize)
            {
                return JsonResponse(413, false, "Слишком большой запрос.");
            }

            using var document = JsonDocument.Parse(json);

            if (document.RootElement.ValueKind != JsonValueKind.Object)
            {
                return JsonResponse(400, false, "Ожидается JSON-объект.");
            }

            var form = document.RootElement;
            var validationError = Validate(form);

            if (validationError is not null)
            {
                return JsonResponse(400, false, validationError);
            }

            var smtpPassword = Environment.GetEnvironmentVariable("SMTP_APP_PASSWORD");

            if (string.IsNullOrWhiteSpace(smtpPassword))
            {
                Console.Error.WriteLine("SMTP_APP_PASSWORD is not configured.");
                return JsonResponse(500, false, "Сервис отправки пока не настроен.");
            }

            SendEmail(form, smtpPassword);
            return JsonResponse(200, true, null);
        }
        catch (JsonException)
        {
            return JsonResponse(400, false, "Не удалось прочитать данные формы.");
        }
        catch (FormatException)
        {
            return JsonResponse(400, false, "Не удалось прочитать данные формы.");
        }
        catch (SmtpException exception)
        {
            Console.Error.WriteLine($"SMTP error: {exception.StatusCode}.");
            return JsonResponse(502, false, "Не удалось отправить заявку. Попробуйте ещё раз.");
        }
        catch (Exception exception)
        {
            Console.Error.WriteLine($"{exception.GetType().Name}: {exception.Message}");
            return JsonResponse(500, false, "Не удалось обработать заявку. Попробуйте ещё раз.");
        }
    }

    private static string DecodeBody(Request request)
    {
        if (string.IsNullOrWhiteSpace(request.body))
        {
            throw new JsonException("Request body is empty.");
        }

        return request.isBase64Encoded
            ? Encoding.UTF8.GetString(Convert.FromBase64String(request.body))
            : request.body;
    }

    private static string? Validate(JsonElement form)
    {
        var requiredFields = new Dictionary<string, string>
        {
            ["building_type"] = "Выберите тип постройки.",
            ["project_state"] = "Укажите состояние проекта.",
            ["location"] = "Укажите населённый пункт или район.",
            ["start_time"] = "Укажите желаемое время начала строительства.",
            ["name"] = "Укажите имя.",
            ["phone"] = "Укажите телефон.",
        };

        foreach (var field in requiredFields)
        {
            if (string.IsNullOrWhiteSpace(ReadText(form, field.Key)))
            {
                return field.Value;
            }
        }

        if (!ReadBoolean(form, "consent"))
        {
            return "Необходимо согласие на обработку данных.";
        }

        var buildingType = ReadText(form, "building_type");

        if (buildingType is not ("house" or "bath" or "gazebo"))
        {
            return "Неизвестный тип постройки.";
        }

        var conditionalError = buildingType switch
        {
            "house" when string.IsNullOrWhiteSpace(ReadText(form, "house_area")) =>
                "Укажите примерную площадь дома.",
            "house" when string.IsNullOrWhiteSpace(ReadText(form, "house_floors")) =>
                "Укажите этажность дома.",
            "bath" when string.IsNullOrWhiteSpace(ReadText(form, "bath_length")) =>
                "Укажите длину бани.",
            "bath" when string.IsNullOrWhiteSpace(ReadText(form, "bath_width")) =>
                "Укажите ширину бани.",
            "bath" when string.IsNullOrWhiteSpace(ReadText(form, "bath_rooms")) =>
                "Укажите помещения бани.",
            "gazebo" when string.IsNullOrWhiteSpace(ReadText(form, "gazebo_type")) =>
                "Укажите тип беседки.",
            "gazebo" when string.IsNullOrWhiteSpace(ReadText(form, "gazebo_length")) =>
                "Укажите длину беседки.",
            "gazebo" when string.IsNullOrWhiteSpace(ReadText(form, "gazebo_width")) =>
                "Укажите ширину беседки.",
            _ => null,
        };

        if (conditionalError is not null)
        {
            return conditionalError;
        }

        var projectState = ReadText(form, "project_state");

        if (projectState is not ("catalog" or "own" or "reference" or "help"))
        {
            return "Неизвестное состояние проекта.";
        }

        if (projectState == "catalog" &&
            string.IsNullOrWhiteSpace(ReadText(form, "project_reference")))
        {
            return "Укажите код проекта из каталога.";
        }

        var phone = ReadText(form, "phone");

        if (phone.Count(char.IsDigit) < 7 || phone.Length > 50)
        {
            return "Проверьте номер телефона.";
        }

        var email = ReadText(form, "email");

        if (!string.IsNullOrWhiteSpace(email) && !MailAddress.TryCreate(email, out _))
        {
            return "Проверьте адрес электронной почты.";
        }

        if (ReadText(form, "contact_method") == "Email" && string.IsNullOrWhiteSpace(email))
        {
            return "Укажите email для выбранного способа связи.";
        }

        if (ReadText(form, "name").Length > 100 ||
            ReadText(form, "location").Length > 200 ||
            ReadText(form, "project_reference").Length > 500 ||
            ReadText(form, "comment").Length > 4000)
        {
            return "Одно из полей превышает допустимую длину.";
        }

        return null;
    }

    private static void SendEmail(JsonElement form, string smtpPassword)
    {
        using var message = new MailMessage
        {
            From = new MailAddress(RecipientEmail, "Сайт СтройКаркас", Encoding.UTF8),
            Subject = "Новая заявка с сайта СтройКаркас",
            SubjectEncoding = Encoding.UTF8,
            Body = BuildEmailBody(form),
            BodyEncoding = Encoding.UTF8,
            IsBodyHtml = false,
        };

        message.To.Add(RecipientEmail);

        var visitorEmail = ReadText(form, "email");

        if (MailAddress.TryCreate(visitorEmail, out var replyTo))
        {
            message.ReplyToList.Add(replyTo);
        }

        using var smtp = new SmtpClient(SmtpHost, SmtpPort)
        {
            Credentials = new NetworkCredential(SmtpLogin, smtpPassword),
            DeliveryMethod = SmtpDeliveryMethod.Network,
            EnableSsl = true,
            Timeout = 20_000,
            UseDefaultCredentials = false,
        };

        smtp.Send(message);
    }

    private static string BuildEmailBody(JsonElement form)
    {
        var text = new StringBuilder();
        var buildingType = ReadText(form, "building_type");

        text.AppendLine("Новая заявка с сайта СтройКаркас");
        text.AppendLine($"Получена: {DateTimeOffset.UtcNow:dd.MM.yyyy HH:mm} UTC");
        text.AppendLine();
        Append(text, "Тип постройки", BuildingTypeName(buildingType));

        switch (buildingType)
        {
            case "house":
                Append(text, "Площадь", AddUnit(ReadText(form, "house_area"), "м²"));
                Append(text, "Этажность", ReadText(form, "house_floors"));
                Append(text, "Использование", ReadText(form, "house_use"));
                Append(text, "Количество комнат", ReadText(form, "house_rooms"));
                Append(text, "Дополнительно", ReadList(form, "house_options"));
                break;
            case "bath":
                Append(text, "Длина", AddUnit(ReadText(form, "bath_length"), "м"));
                Append(text, "Ширина", AddUnit(ReadText(form, "bath_width"), "м"));
                Append(text, "Помещения", ReadText(form, "bath_rooms"));
                Append(text, "Дополнительно", ReadList(form, "bath_options"));
                break;
            case "gazebo":
                Append(text, "Тип беседки", ReadText(form, "gazebo_type"));
                Append(text, "Длина", AddUnit(ReadText(form, "gazebo_length"), "м"));
                Append(text, "Ширина", AddUnit(ReadText(form, "gazebo_width"), "м"));
                Append(text, "Дополнительно", ReadList(form, "gazebo_options"));
                break;
        }

        text.AppendLine();
        Append(text, "Состояние проекта", ProjectStateName(ReadText(form, "project_state")));
        Append(text, "Код проекта или ссылка", ReadText(form, "project_reference"));
        Append(text, "Населённый пункт или район", ReadText(form, "location"));
        Append(text, "Участок", ReadText(form, "plot_state"));
        Append(text, "Начало строительства", ReadText(form, "start_time"));
        Append(text, "Пожелания", ReadText(form, "comment"));

        text.AppendLine();
        Append(text, "Имя", ReadText(form, "name"));
        Append(text, "Телефон", ReadText(form, "phone"));
        Append(text, "Email", ReadText(form, "email"));
        Append(text, "Удобный способ связи", ReadText(form, "contact_method"));
        Append(text, "Согласие на обработку данных", "Да");

        return text.ToString();
    }

    private static string ReadText(JsonElement form, string propertyName)
    {
        if (!form.TryGetProperty(propertyName, out var value))
        {
            return string.Empty;
        }

        return value.ValueKind switch
        {
            JsonValueKind.String => value.GetString()?.Trim() ?? string.Empty,
            JsonValueKind.Number => value.GetRawText(),
            _ => string.Empty,
        };
    }

    private static bool ReadBoolean(JsonElement form, string propertyName)
    {
        if (!form.TryGetProperty(propertyName, out var value))
        {
            return false;
        }

        return value.ValueKind switch
        {
            JsonValueKind.True => true,
            JsonValueKind.String => value.GetString() is "true" or "on" or "yes" or "1",
            JsonValueKind.Number => value.TryGetInt32(out var number) && number == 1,
            _ => false,
        };
    }

    private static string ReadList(JsonElement form, string propertyName)
    {
        if (!form.TryGetProperty(propertyName, out var value))
        {
            return string.Empty;
        }

        if (value.ValueKind == JsonValueKind.Array)
        {
            return string.Join(", ", value.EnumerateArray()
                .Where(item => item.ValueKind == JsonValueKind.String)
                .Select(item => item.GetString()?.Trim())
                .Where(item => !string.IsNullOrWhiteSpace(item)));
        }

        return value.ValueKind == JsonValueKind.String
            ? value.GetString()?.Trim() ?? string.Empty
            : string.Empty;
    }

    private static string BuildingTypeName(string value) => value switch
    {
        "house" => "Садовый дом",
        "bath" => "Баня",
        "gazebo" => "Беседка",
        _ => value,
    };

    private static string ProjectStateName(string value) => value switch
    {
        "catalog" => "Проект из каталога",
        "own" => "Свой проект",
        "reference" => "Ссылка на пример",
        "help" => "Нужна помощь с проектом",
        _ => value,
    };

    private static string AddUnit(string value, string unit) =>
        string.IsNullOrWhiteSpace(value) ? string.Empty : $"{value} {unit}";

    private static void Append(StringBuilder text, string label, string value)
    {
        text.AppendLine($"{label}: {(string.IsNullOrWhiteSpace(value) ? "—" : value)}");
    }

    private static string? GetHeader(Dictionary<string, string>? headers, string name)
    {
        if (headers is null)
        {
            return null;
        }

        foreach (var header in headers)
        {
            if (string.Equals(header.Key, name, StringComparison.OrdinalIgnoreCase))
            {
                return header.Value;
            }
        }

        return null;
    }

    private static Response JsonResponse(int statusCode, bool success, string? error)
    {
        var body = error is null
            ? JsonSerializer.Serialize(new { success }, JsonOptions)
            : JsonSerializer.Serialize(new { success, error }, JsonOptions);

        return CreateResponse(statusCode, body);
    }

    private static Response CreateResponse(int statusCode, string body) => new(statusCode, body)
    {
        Headers = new Dictionary<string, string>
        {
            ["Content-Type"] = "application/json; charset=utf-8",
            ["Access-Control-Allow-Origin"] = AllowedOrigin,
            ["Access-Control-Allow-Methods"] = "POST, OPTIONS",
            ["Access-Control-Allow-Headers"] = "Content-Type",
            ["Cache-Control"] = "no-store",
            ["Vary"] = "Origin",
        },
        IsBase64Encoded = false,
    };
}
